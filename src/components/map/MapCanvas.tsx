"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Stage, Layer, Image as KonvaImage, Line, Group, Circle, Rect, Text } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type Konva from "konva";
import useImage from "use-image";
import { createClient } from "@/lib/supabase/client";
import { useSessionStore } from "@/store/session";
import type { Token } from "@/types";
import { useAuth } from "@/lib/useAuth";

interface MapCanvasProps {
  sessionId: string;
  broadcastTokenMove: (id: string, x: number, y: number) => void;
}

const GRID_COLOR = "rgba(255,255,255,0.15)";
const TOKEN_RADIUS = 28;
// Grid extends well beyond the viewport so it stays visible while panning/zooming
const VIRTUAL_SIZE = 6000;
const SCALE_BY = 1.12;
const MIN_SCALE = 0.15;
const MAX_SCALE = 5;

// ---------------------------------------------------------------------------
// TokenShape
// ---------------------------------------------------------------------------
function TokenShape({ token, canControl, panMode, onDragMove, onDragEnd, onHpChange }: {
  token: Token;
  canControl: boolean;
  panMode: boolean;
  onDragMove: (id: string, x: number, y: number) => void;
  onDragEnd: (id: string, x: number, y: number) => void;
  onHpChange: (token: Token, delta: number) => void;
}) {
  const hpRatio = Math.max(0, token.hp / token.max_hp);
  const barWidth = TOKEN_RADIUS * 2;
  const barHeight = 6;
  const lastBroadcast = useRef(0);

  // Tokens are not draggable when pan mode is active
  const draggable = canControl && !panMode;

  return (
    <Group
      x={token.x}
      y={token.y}
      draggable={draggable}
      onDragMove={(e) => {
        const now = Date.now();
        if (now - lastBroadcast.current >= 50) {
          lastBroadcast.current = now;
          onDragMove(token.id, e.target.x(), e.target.y());
        }
      }}
      onDragEnd={(e) => {
        // No grid snapping — drop wherever the user releases
        onDragEnd(token.id, e.target.x(), e.target.y());
      }}
    >
      <Circle
        radius={TOKEN_RADIUS}
        fill={token.color}
        stroke="white"
        strokeWidth={2}
        shadowBlur={6}
        shadowColor="black"
        shadowOpacity={0.4}
      />
      <Text
        text={token.name.slice(0, 8)}
        fontSize={11}
        fontStyle="bold"
        fill="white"
        align="center"
        verticalAlign="middle"
        width={TOKEN_RADIUS * 2}
        height={TOKEN_RADIUS * 2}
        x={-TOKEN_RADIUS}
        y={-TOKEN_RADIUS}
      />
      {/* HP bar */}
      <Rect x={-TOKEN_RADIUS} y={TOKEN_RADIUS + 4} width={barWidth} height={barHeight} fill="#374151" cornerRadius={3} />
      <Rect
        x={-TOKEN_RADIUS}
        y={TOKEN_RADIUS + 4}
        width={barWidth * hpRatio}
        height={barHeight}
        fill={hpRatio > 0.5 ? "#22c55e" : hpRatio > 0.25 ? "#eab308" : "#ef4444"}
        cornerRadius={3}
      />
      {/* HP +/- — only for tokens you can control */}
      {canControl && (
        <>
          <Circle radius={10} x={-TOKEN_RADIUS - 14} y={0} fill="rgba(0,0,0,0.5)" stroke="#6b7280" strokeWidth={1}
            onClick={() => onHpChange(token, -1)} onTap={() => onHpChange(token, -1)} />
          <Text text="−" x={-TOKEN_RADIUS - 21} y={-7} fontSize={13} fill="white"
            onClick={() => onHpChange(token, -1)} onTap={() => onHpChange(token, -1)} />
          <Circle radius={10} x={TOKEN_RADIUS + 14} y={0} fill="rgba(0,0,0,0.5)" stroke="#6b7280" strokeWidth={1}
            onClick={() => onHpChange(token, 1)} onTap={() => onHpChange(token, 1)} />
          <Text text="+" x={TOKEN_RADIUS + 8} y={-7} fontSize={13} fill="white"
            onClick={() => onHpChange(token, 1)} onTap={() => onHpChange(token, 1)} />
        </>
      )}
    </Group>
  );
}

// ---------------------------------------------------------------------------
// MapBackground
// ---------------------------------------------------------------------------
function MapBackground({ url, width, height }: { url: string; width: number; height: number }) {
  const [image] = useImage(url);
  return <KonvaImage image={image} width={width} height={height} />;
}

// ---------------------------------------------------------------------------
// MapCanvas
// ---------------------------------------------------------------------------
export default function MapCanvas({ sessionId, broadcastTokenMove }: MapCanvasProps) {
  useAuth();

  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [panMode, setPanMode] = useState(false);

  const { session, tokens, updateTokenPosition, upsertToken, userId } = useSessionStore();

  const isOwner = !!userId && session?.owner_id === userId;
  const canControl = (tokenOwnerId: string | null) => isOwner || tokenOwnerId === userId;
  const gridSize = session?.grid_size ?? 60;
  const mapUrl = session?.map_url ?? null;

  // Responsive canvas sizing
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ width, height });
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Mouse-wheel zoom centered on the cursor
  const handleWheel = useCallback((e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const oldScale = stageScale;
    const direction = e.evt.deltaY < 0 ? 1 : -1;
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, direction > 0 ? oldScale * SCALE_BY : oldScale / SCALE_BY));

    // Keep the point under the cursor fixed
    const mousePointTo = {
      x: (pointer.x - stagePos.x) / oldScale,
      y: (pointer.y - stagePos.y) / oldScale,
    };
    setStageScale(newScale);
    setStagePos({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  }, [stageScale, stagePos]);

  const zoomBy = useCallback((factor: number) => {
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, stageScale * factor));
    // Zoom toward center of viewport
    const cx = size.width / 2;
    const cy = size.height / 2;
    const mousePointTo = {
      x: (cx - stagePos.x) / stageScale,
      y: (cy - stagePos.y) / stageScale,
    };
    setStageScale(newScale);
    setStagePos({
      x: cx - mousePointTo.x * newScale,
      y: cy - mousePointTo.y * newScale,
    });
  }, [stageScale, stagePos, size]);

  const resetView = useCallback(() => {
    setStageScale(1);
    setStagePos({ x: 0, y: 0 });
  }, []);

  const handleDragMove = useCallback((id: string, x: number, y: number) => {
    broadcastTokenMove(id, x, y);
  }, [broadcastTokenMove]);

  const handleDragEnd = async (id: string, x: number, y: number) => {
    updateTokenPosition(id, x, y);
    const supabase = createClient();
    await supabase.from("tokens").update({ x, y }).eq("id", id);
  };

  const handleHpChange = async (token: Token, delta: number) => {
    const newHp = Math.max(0, Math.min(token.max_hp, token.hp + delta));
    upsertToken({ ...token, hp: newHp });
    const supabase = createClient();
    await supabase.from("tokens").update({ hp: newHp }).eq("id", token.id);
  };

  // Grid lines over the full virtual canvas so they're always visible when panning
  const gridLines: React.ReactElement[] = [];
  for (let x = 0; x <= VIRTUAL_SIZE; x += gridSize) {
    gridLines.push(<Line key={`v${x}`} points={[x, 0, x, VIRTUAL_SIZE]} stroke={GRID_COLOR} strokeWidth={1} />);
  }
  for (let y = 0; y <= VIRTUAL_SIZE; y += gridSize) {
    gridLines.push(<Line key={`h${y}`} points={[0, y, VIRTUAL_SIZE, y]} stroke={GRID_COLOR} strokeWidth={1} />);
  }

  return (
    <div ref={containerRef} className="w-full h-full bg-gray-900 rounded-lg overflow-hidden relative">
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        scaleX={stageScale}
        scaleY={stageScale}
        x={stagePos.x}
        y={stagePos.y}
        draggable={panMode}
        onDragEnd={(e) => setStagePos({ x: e.target.x(), y: e.target.y() })}
        onWheel={handleWheel}
        style={{ cursor: panMode ? "grab" : "default" }}
      >
        <Layer>
          {mapUrl
            ? <MapBackground url={mapUrl} width={size.width / stageScale} height={size.height / stageScale} />
            : <Rect width={VIRTUAL_SIZE} height={VIRTUAL_SIZE} fill="#1f2937" />
          }
          {gridLines}
        </Layer>
        <Layer>
          {tokens.map((token) => (
            <TokenShape
              key={token.id}
              token={token}
              canControl={canControl(token.owner_id)}
              panMode={panMode}
              onDragMove={handleDragMove}
              onDragEnd={handleDragEnd}
              onHpChange={handleHpChange}
            />
          ))}
        </Layer>
      </Stage>

      {/* Map controls overlay — bottom-right */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-gray-950/80 backdrop-blur-sm border border-gray-700 rounded-lg px-2 py-1.5">
        {/* Pan mode toggle */}
        <button
          onClick={() => setPanMode((m) => !m)}
          title={panMode ? "Switch to select mode" : "Switch to pan mode"}
          className={`w-7 h-7 flex items-center justify-center rounded text-sm transition-colors ${
            panMode ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-700"
          }`}
        >
          ✥
        </button>

        <div className="w-px h-4 bg-gray-700 mx-0.5" />

        {/* Zoom controls */}
        <button
          onClick={() => zoomBy(1 / SCALE_BY)}
          className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-white hover:bg-gray-700 text-base transition-colors"
          title="Zoom out"
        >
          −
        </button>
        <button
          onClick={resetView}
          className="text-xs text-gray-400 hover:text-white transition-colors w-10 text-center tabular-nums"
          title="Reset zoom"
        >
          {Math.round(stageScale * 100)}%
        </button>
        <button
          onClick={() => zoomBy(SCALE_BY)}
          className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-white hover:bg-gray-700 text-base transition-colors"
          title="Zoom in"
        >
          +
        </button>
      </div>
    </div>
  );
}
