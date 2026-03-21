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
const DEFAULT_TOKEN_SIZE = 56;
const MIN_TOKEN_SIZE = 24;
const MAX_TOKEN_SIZE = 120;
// Grid extends well beyond the viewport so it stays visible while panning/zooming
const VIRTUAL_SIZE = 6000;
const SCALE_BY = 1.12;
const MIN_SCALE = 0.15;
const MAX_SCALE = 5;
// Padding from image edge when constraining tokens (px)
const TOKEN_PADDING = 20;

// Clamp stage position so the map edge never goes past the viewport edge.
// When the map is larger than the viewport, no blank space is visible.
// When the map is smaller, it floats freely within the viewport.
function clampStagePos(
  pos: { x: number; y: number },
  scale: number,
  viewport: { width: number; height: number },
  map: { width: number; height: number } | null
): { x: number; y: number } {
  if (!map) return pos;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const mapW = map.width * scale;
  const mapH = map.height * scale;
  return {
    x: clamp(pos.x, Math.min(0, viewport.width  - mapW), Math.max(0, viewport.width  - mapW)),
    y: clamp(pos.y, Math.min(0, viewport.height - mapH), Math.max(0, viewport.height - mapH)),
  };
}

// ---------------------------------------------------------------------------
// TokenShape
// ---------------------------------------------------------------------------
function TokenShape({ token, canControl, tokenSize, imageBounds, stageRef, onDragMove, onDragEnd, onHpChange }: {
  token: Token;
  canControl: boolean;
  tokenSize: number;
  imageBounds: { x: number; y: number; width: number; height: number } | null;
  stageRef: React.MutableRefObject<Konva.Stage | null>;
  onDragMove: (id: string, x: number, y: number) => void;
  onDragEnd: (id: string, x: number, y: number) => void;
  onHpChange: (token: Token, delta: number) => void;
}) {
  const hpRatio = Math.max(0, token.hp / token.max_hp);
  const radius = tokenSize / 2;
  const barWidth = tokenSize;
  const barHeight = 6;
  const lastBroadcast = useRef(0);

  const draggable = canControl;

  function clampToBounds(val: number, min: number, max: number) {
    return Math.max(min, Math.min(max, val));
  }

  function getBoundedPosition(x: number, y: number) {
    if (!imageBounds) return { x, y };
    return {
      x: clampToBounds(x, imageBounds.x + radius + TOKEN_PADDING, imageBounds.x + imageBounds.width - radius - TOKEN_PADDING),
      y: clampToBounds(y, imageBounds.y + radius + TOKEN_PADDING, imageBounds.y + imageBounds.height - radius - TOKEN_PADDING),
    };
  }

  return (
    <Group
      x={token.x}
      y={token.y}
      draggable={draggable}
      onDragStart={() => {
        if (stageRef.current) {
          stageRef.current.container().style.cursor = "grabbing";
        }
      }}
      onDragMove={(e) => {
        const lx = e.target.x();
        const ly = e.target.y();
        const bounded = getBoundedPosition(lx, ly);
        e.target.x(bounded.x);
        e.target.y(bounded.y);
        const now = Date.now();
        if (now - lastBroadcast.current >= 50) {
          lastBroadcast.current = now;
          onDragMove(token.id, bounded.x, bounded.y);
        }
      }}
      onDragEnd={(e) => {
        const lx = e.target.x();
        const ly = e.target.y();
        const bounded = getBoundedPosition(lx, ly);
        onDragEnd(token.id, bounded.x, bounded.y);
        if (stageRef.current) {
          stageRef.current.container().style.cursor = "grab";
        }
      }}
    >
      <Circle
        radius={radius}
        fill={token.color}
        stroke="white"
        strokeWidth={3}
        shadowBlur={8}
        shadowColor="black"
        shadowOpacity={0.5}
      />
      <Text
        text={token.name.slice(0, 8)}
        fontSize={Math.max(10, radius / 2.5)}
        fontStyle="bold"
        fill="white"
        align="center"
        verticalAlign="middle"
        width={tokenSize}
        height={tokenSize}
        x={-radius}
        y={-radius}
      />
      {/* HP bar */}
      <Rect x={-radius} y={radius + 4} width={barWidth} height={barHeight} fill="#374151" cornerRadius={3} />
      <Rect
        x={-radius}
        y={radius + 4}
        width={barWidth * hpRatio}
        height={barHeight}
        fill={hpRatio > 0.5 ? "#22c55e" : hpRatio > 0.25 ? "#eab308" : "#ef4444"}
        cornerRadius={3}
      />
      {/* HP +/- — only for tokens you can control */}
      {canControl && (
        <>
          <Circle radius={10} x={-radius - 14} y={0} fill="rgba(0,0,0,0.5)" stroke="#6b7280" strokeWidth={1}
            onClick={() => onHpChange(token, -1)} onTap={() => onHpChange(token, -1)} />
          <Text text="−" x={-radius - 21} y={-7} fontSize={13} fill="white"
            onClick={() => onHpChange(token, -1)} onTap={() => onHpChange(token, -1)} />
          <Circle radius={10} x={radius + 14} y={0} fill="rgba(0,0,0,0.5)" stroke="#6b7280" strokeWidth={1}
            onClick={() => onHpChange(token, 1)} onTap={() => onHpChange(token, 1)} />
          <Text text="+" x={radius + 8} y={-7} fontSize={13} fill="white"
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
  return <KonvaImage name="background" image={image} width={width} height={height} />;
}

// ---------------------------------------------------------------------------
// Image size hook
// ---------------------------------------------------------------------------
function useImageSize(url: string | null) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!url) { setSize({ width: 0, height: 0 }); return; }
    const img = new Image();
    img.onload = () => setSize({ width: img.naturalWidth, height: img.naturalHeight });
    img.src = url;
  }, [url]);
  return size;
}

// ---------------------------------------------------------------------------
// MapCanvas
// ---------------------------------------------------------------------------
export default function MapCanvas({ broadcastTokenMove }: MapCanvasProps) {
  useAuth();

  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  // Pending token size: local preview while DM drags the slider (avoids a DB write per pixel)
  const [pendingTokenSize, setPendingTokenSize] = useState<number | null>(null);

  // Refs for values used in event handlers (avoid stale closures)
  const stageScaleRef = useRef(stageScale);
  const stagePosRef = useRef(stagePos);
  const sizeRef = useRef(size);

  // Keep refs in sync with state
  useEffect(() => { stageScaleRef.current = stageScale; }, [stageScale]);
  useEffect(() => { stagePosRef.current = stagePos; }, [stagePos]);
  useEffect(() => { sizeRef.current = size; }, [size]);

  // Panning state
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panOrigin = useRef({ x: 0, y: 0 });

  const { session, tokens, updateTokenPosition, upsertToken, setSession, userId } = useSessionStore();

  const isOwner = !!userId && session?.owner_id === userId;
  const canControl = (tokenOwnerId: string | null) => isOwner || tokenOwnerId === userId;
  const gridSize = session?.grid_size ?? 60;
  const mapUrl = session?.map_url ?? null;

  const imageSize = useImageSize(mapUrl);

  const imageBounds = mapUrl && imageSize.width > 0 ? { x: 0, y: 0, ...imageSize } : null;
  const imageBoundsRef = useRef(imageBounds);
  useEffect(() => { imageBoundsRef.current = imageBounds; }, [imageBounds]);

  // Calculate min zoom to fit entire map (computed value for UI, not used in event handlers)
  const minZoom = imageBounds
    ? Math.min(size.width / imageBounds.width, size.height / imageBounds.height)
    : MIN_SCALE;

  // Responsive canvas sizing
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ width, height });
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const setZoom = useCallback((newScale: number, cx?: number, cy?: number) => {
    const centerX = cx ?? sizeRef.current.width / 2;
    const centerY = cy ?? sizeRef.current.height / 2;
    const mousePointTo = {
      x: (centerX - stagePosRef.current.x) / stageScaleRef.current,
      y: (centerY - stagePosRef.current.y) / stageScaleRef.current,
    };
    const raw = {
      x: centerX - mousePointTo.x * newScale,
      y: centerY - mousePointTo.y * newScale,
    };
    const newPos = clampStagePos(raw, newScale, sizeRef.current, imageBoundsRef.current);
    stageScaleRef.current = newScale;
    stagePosRef.current = newPos;
    setStageScale(newScale);
    setStagePos(newPos);
  }, []);

  const zoomBy = useCallback((factor: number) => {
    const currentScale = stageScaleRef.current;
    const newScale = Math.max(minZoom, Math.min(MAX_SCALE, currentScale * factor));
    setZoom(newScale);
  }, [setZoom, minZoom]);

  const handleWheel = useCallback((e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const direction = e.evt.deltaY < 0 ? 1 : -1;
    const currentScale = stageScaleRef.current;
    const newScale = Math.max(minZoom, Math.min(MAX_SCALE, direction > 0 ? currentScale * SCALE_BY : currentScale / SCALE_BY));
    setZoom(newScale, pointer.x, pointer.y);
  }, [setZoom, minZoom]);

  const resetView = useCallback(() => {
    if (!imageBounds) {
      const newPos = { x: 0, y: 0 };
      setStageScale(minZoom);
      setStagePos(newPos);
      stagePosRef.current = newPos;
      return;
    }
    const fitScale = Math.min(size.width / imageBounds.width, size.height / imageBounds.height);
    const sx = (size.width - imageBounds.width * fitScale) / 2;
    const sy = (size.height - imageBounds.height * fitScale) / 2;
    const newPos = { x: sx, y: sy };
    setStageScale(fitScale);
    setStagePos(newPos);
    stagePosRef.current = newPos;
  }, [imageBounds, size, minZoom]);

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

  // Grid lines aligned with image dimensions
  const gridWidth = mapUrl && imageSize.width > 0 ? imageSize.width : VIRTUAL_SIZE;
  const gridHeight = mapUrl && imageSize.height > 0 ? imageSize.height : VIRTUAL_SIZE;
  const gridLines: React.ReactElement[] = [];
  for (let x = 0; x <= gridWidth; x += gridSize) {
    gridLines.push(<Line key={`v${x}`} points={[x, 0, x, gridHeight]} stroke={GRID_COLOR} strokeWidth={1} />);
  }
  for (let y = 0; y <= gridHeight; y += gridSize) {
    gridLines.push(<Line key={`h${y}`} points={[0, y, gridWidth, y]} stroke={GRID_COLOR} strokeWidth={1} />);
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-gray-900 rounded-lg overflow-hidden relative"
    >
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        scaleX={stageScale}
        scaleY={stageScale}
        x={stagePos.x}
        y={stagePos.y}
        onWheel={handleWheel}
        onMouseDown={(e) => {
          // Pan when clicking background, map image, or grid — not tokens
          if (e.target.name() === 'background' || e.target.getClassName() === 'Line') {
            isPanning.current = true;
            panStart.current = { x: e.evt.clientX, y: e.evt.clientY };
            panOrigin.current = { ...stagePosRef.current };
          }
        }}
        onMouseMove={(e) => {
          if (!isPanning.current) return;
          const dx = e.evt.clientX - panStart.current.x;
          const dy = e.evt.clientY - panStart.current.y;
          const raw = { x: panOrigin.current.x + dx, y: panOrigin.current.y + dy };
          const newPos = clampStagePos(raw, stageScaleRef.current, sizeRef.current, imageBoundsRef.current);
          stagePosRef.current = newPos;
          setStagePos(newPos);
        }}
        onMouseUp={() => { isPanning.current = false; }}
        onMouseLeave={() => { isPanning.current = false; }}
      >
        <Layer>
          <Rect
            name="background"
            x={0}
            y={0}
            width={VIRTUAL_SIZE}
            height={VIRTUAL_SIZE}
            fill="rgba(0,0,0,0.001)"
          />
          {mapUrl && imageSize.width > 0
            ? <MapBackground url={mapUrl} width={imageSize.width} height={imageSize.height} />
            : <Rect name="background" width={VIRTUAL_SIZE} height={VIRTUAL_SIZE} fill="#1f2937" />
          }
          {gridLines}
        </Layer>
        <Layer>
          {tokens.map((token) => {
            const defaultSize = pendingTokenSize ?? session?.token_size ?? DEFAULT_TOKEN_SIZE;
            const effectiveSize = token.size ?? defaultSize;
            return (
              <TokenShape
                key={token.id}
                token={token}
                canControl={canControl(token.owner_id)}
                tokenSize={effectiveSize}
                imageBounds={imageBounds}
                stageRef={stageRef}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
                onHpChange={handleHpChange}
              />
            );
          })}
        </Layer>
      </Stage>

      {/* Map controls overlay — bottom-right */}
      <div className="absolute bottom-3 right-3 flex items-center gap-2 bg-gray-950/80 backdrop-blur-sm border border-gray-700 rounded-lg px-3 py-2">
        {/* Default token size — DM only */}
        {isOwner && session && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Token</span>
              <button
                onClick={async () => {
                  const newSize = Math.max(MIN_TOKEN_SIZE, (session.token_size) - 4);
                  setSession({ ...session, token_size: newSize });
                  await createClient().from("sessions").update({ token_size: newSize }).eq("id", session.id);
                }}
                className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-white hover:bg-gray-700 text-sm transition-colors"
              >−</button>
              <input
                type="range"
                min={MIN_TOKEN_SIZE}
                max={MAX_TOKEN_SIZE}
                value={pendingTokenSize ?? session.token_size}
                onChange={(e) => setPendingTokenSize(Number(e.target.value))}
                onPointerUp={async () => {
                  if (pendingTokenSize === null) return;
                  const newSize = pendingTokenSize;
                  setSession({ ...session, token_size: newSize });
                  setPendingTokenSize(null);
                  await createClient().from("sessions").update({ token_size: newSize }).eq("id", session.id);
                }}
                className="w-20 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
              <button
                onClick={async () => {
                  const newSize = Math.min(MAX_TOKEN_SIZE, (session.token_size) + 4);
                  setSession({ ...session, token_size: newSize });
                  await createClient().from("sessions").update({ token_size: newSize }).eq("id", session.id);
                }}
                className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-white hover:bg-gray-700 text-sm transition-colors"
              >+</button>
            </div>
            <div className="w-px h-6 bg-gray-700" />
          </>
        )}

        {/* Zoom buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => zoomBy(1 / SCALE_BY)}
            className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-white hover:bg-gray-700 text-base transition-colors"
            title="Zoom out (scroll down)"
          >
            −
          </button>
          <button
            onClick={resetView}
            className="text-xs text-gray-400 hover:text-white transition-colors w-12 text-center tabular-nums"
            title="Fit map to screen"
          >
            {Math.round(stageScale * 100)}%
          </button>
          <button
            onClick={() => zoomBy(SCALE_BY)}
            className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-white hover:bg-gray-700 text-base transition-colors"
            title="Zoom in (scroll up)"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
