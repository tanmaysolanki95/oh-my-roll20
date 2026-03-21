"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Stage, Layer, Image as KonvaImage, Line, Group, Circle, Rect, Text } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type Konva from "konva";
import useImage from "use-image";
import { createClient } from "@/lib/supabase/client";
import { useSessionStore } from "@/store/session";
import type { Token, FogShape } from "@/types";
import { useAuth } from "@/lib/useAuth";

interface MapCanvasProps {
  sessionId: string;
  broadcastTokenMove: (id: string, x: number, y: number) => void;
  broadcastTokenDragStart: (token_id: string) => void;
  broadcastTokenDragEnd: (token_id: string) => void;
  lockedBy: Record<string, string>; // token_id → user_id currently dragging it
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
function TokenShape({ token, canControl, draggable, opacity, tokenSize, imageBounds, stageRef, onDragMove, onDragEnd, onDragStart, onHpChange }: {
  token: Token;
  canControl: boolean;
  draggable: boolean;
  opacity: number;
  tokenSize: number;
  imageBounds: { x: number; y: number; width: number; height: number } | null;
  stageRef: React.MutableRefObject<Konva.Stage | null>;
  onDragMove: (id: string, x: number, y: number) => void;
  onDragEnd: (id: string, x: number, y: number) => void;
  onDragStart: (id: string) => void;
  onHpChange: (token: Token, delta: number) => void;
}) {
  const hpRatio = Math.max(0, token.hp / token.max_hp);
  const radius = tokenSize / 2;
  const barWidth = tokenSize;
  const barHeight = 6;
  const lastBroadcast = useRef(0);

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
      opacity={opacity}
      draggable={draggable}
      onDragStart={() => {
        onDragStart(token.id);
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
export default function MapCanvas({ broadcastTokenMove, broadcastTokenDragStart, broadcastTokenDragEnd, lockedBy }: MapCanvasProps) {
  useAuth();

  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  // Pending token size: local preview while DM drags the slider (avoids a DB write per pixel)
  const [pendingTokenSize, setPendingTokenSize] = useState<number | null>(null);

  // Fog of war
  const [fogTool, setFogToolState] = useState<"reveal" | "hide" | null>(null);
  const fogToolRef = useRef<"reveal" | "hide" | null>(null);
  const [fogPreview, setFogPreview] = useState<FogShape | null>(null);
  const isFogPainting = useRef(false);
  const fogPaintStart = useRef<{ x: number; y: number } | null>(null);

  const activateFogTool = (tool: "reveal" | "hide" | null) => {
    setFogToolState(tool);
    fogToolRef.current = tool;
  };

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
    broadcastTokenDragEnd(id); // release drag lock for other clients
    const supabase = createClient();
    await supabase.from("tokens").update({ x, y }).eq("id", id);
  };

  // Fog of war operations
  const toggleFog = async () => {
    const s = useSessionStore.getState().session;
    if (!s) return;
    const enabled = !s.fog_enabled;
    setSession({ ...s, fog_enabled: enabled });
    if (!enabled) activateFogTool(null);
    await createClient().from("sessions").update({ fog_enabled: enabled }).eq("id", s.id);
  };

  const commitFogShape = async (shape: FogShape) => {
    const s = useSessionStore.getState().session;
    if (!s) return;
    const shapes = [...(s.fog_shapes ?? []), shape];
    setSession({ ...s, fog_shapes: shapes });
    await createClient().from("sessions").update({ fog_shapes: shapes }).eq("id", s.id);
  };

  const clearFog = async () => {
    const s = useSessionStore.getState().session;
    if (!s) return;
    setSession({ ...s, fog_shapes: [] });
    await createClient().from("sessions").update({ fog_shapes: [] }).eq("id", s.id);
  };

  // Cursor: crosshair in fog mode
  useEffect(() => {
    const container = stageRef.current?.container();
    if (container) container.style.cursor = fogTool ? "crosshair" : "";
  }, [fogTool]);

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
          // Fog painting takes priority over panning
          if (fogToolRef.current && isOwner) {
            const pointer = stageRef.current?.getPointerPosition();
            if (!pointer) return;
            const wx = (pointer.x - stagePosRef.current.x) / stageScaleRef.current;
            const wy = (pointer.y - stagePosRef.current.y) / stageScaleRef.current;
            isFogPainting.current = true;
            fogPaintStart.current = { x: wx, y: wy };
            setFogPreview({ x: wx, y: wy, w: 0, h: 0, type: fogToolRef.current });
            return;
          }
          // Pan when clicking background, map image, or grid — not tokens
          if (e.target.name() === "background" || e.target.getClassName() === "Line") {
            isPanning.current = true;
            panStart.current = { x: e.evt.clientX, y: e.evt.clientY };
            panOrigin.current = { ...stagePosRef.current };
          }
        }}
        onMouseMove={(e) => {
          if (isFogPainting.current && fogPaintStart.current) {
            const pointer = stageRef.current?.getPointerPosition();
            if (!pointer) return;
            const wx = (pointer.x - stagePosRef.current.x) / stageScaleRef.current;
            const wy = (pointer.y - stagePosRef.current.y) / stageScaleRef.current;
            const start = fogPaintStart.current;
            setFogPreview({
              x: Math.min(start.x, wx),
              y: Math.min(start.y, wy),
              w: Math.abs(wx - start.x),
              h: Math.abs(wy - start.y),
              type: fogToolRef.current!,
            });
            return;
          }
          if (!isPanning.current) return;
          const dx = e.evt.clientX - panStart.current.x;
          const dy = e.evt.clientY - panStart.current.y;
          const raw = { x: panOrigin.current.x + dx, y: panOrigin.current.y + dy };
          const newPos = clampStagePos(raw, stageScaleRef.current, sizeRef.current, imageBoundsRef.current);
          stagePosRef.current = newPos;
          setStagePos(newPos);
        }}
        onMouseUp={() => {
          if (isFogPainting.current) {
            isFogPainting.current = false;
            const start = fogPaintStart.current;
            fogPaintStart.current = null;
            setFogPreview(null);
            if (start) {
              const pointer = stageRef.current?.getPointerPosition();
              if (pointer) {
                const wx = (pointer.x - stagePosRef.current.x) / stageScaleRef.current;
                const wy = (pointer.y - stagePosRef.current.y) / stageScaleRef.current;
                const shape: FogShape = {
                  x: Math.min(start.x, wx),
                  y: Math.min(start.y, wy),
                  w: Math.abs(wx - start.x),
                  h: Math.abs(wy - start.y),
                  type: fogToolRef.current!,
                };
                if (shape.w > 4 && shape.h > 4) commitFogShape(shape);
              }
            }
            return;
          }
          isPanning.current = false;
        }}
        onMouseLeave={() => {
          if (isFogPainting.current) {
            isFogPainting.current = false;
            fogPaintStart.current = null;
            setFogPreview(null);
            return;
          }
          isPanning.current = false;
        }}
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
        {/* Fog of war layer — between background and tokens */}
        {session?.fog_enabled && (() => {
          // Admin sees a distinct indigo tint at 65% so they can still read the map.
          // Players see fully opaque black — nothing bleeds through.
          const fogFill = isOwner ? "#1e1b4b" : "black";
          const fogOpacity = isOwner ? 0.65 : 1;
          return (
            <Layer listening={false} opacity={fogOpacity}>
              {/* Cover entire virtual canvas — prevents sub-pixel bleed at map edges when zoomed */}
              <Rect x={0} y={0} width={VIRTUAL_SIZE} height={VIRTUAL_SIZE} fill={fogFill} />
              {(session.fog_shapes ?? []).map((shape, i) =>
                shape.type === "reveal"
                  ? <Rect key={i} x={shape.x} y={shape.y} width={shape.w} height={shape.h}
                      fill="black" globalCompositeOperation="destination-out" />
                  : <Rect key={i} x={shape.x} y={shape.y} width={shape.w} height={shape.h}
                      fill={fogFill} globalCompositeOperation="source-over" />
              )}
              {/* Live preview while painting */}
              {fogPreview && (
                fogPreview.type === "reveal"
                  ? <Rect x={fogPreview.x} y={fogPreview.y} width={fogPreview.w} height={fogPreview.h}
                      fill="black" globalCompositeOperation="destination-out" />
                  : <Rect x={fogPreview.x} y={fogPreview.y} width={fogPreview.w} height={fogPreview.h}
                      fill={fogFill} globalCompositeOperation="source-over" />
              )}
            </Layer>
          );
        })()}

        {/* Admin overlay: green tint over revealed areas — no per-shape borders to avoid overlap lines */}
        {isOwner && session?.fog_enabled && (
          <Layer listening={false}>
            {(session.fog_shapes ?? []).filter(s => s.type === "reveal").map((shape, i) => (
              <Rect
                key={i}
                x={shape.x} y={shape.y}
                width={shape.w} height={shape.h}
                fill="rgba(34,197,94,0.25)"
              />
            ))}
          </Layer>
        )}

        {/* Token layer — above fog */}
        <Layer>
          {tokens.filter(t => isOwner || (t.visible ?? true)).map((token) => {
            const effectiveSize = token.size ?? DEFAULT_TOKEN_SIZE;
            const controllable = canControl(token.owner_id);
            const isLockedByOwner = token.owner_id !== null && lockedBy[token.id] === token.owner_id;
            const isDraggable = controllable && !(isOwner && isLockedByOwner);
            // Admin sees hidden tokens at reduced opacity
            const tokenOpacity = isOwner && !(token.visible ?? true) ? 0.35 : 1;
            return (
              <TokenShape
                key={token.id}
                token={token}
                canControl={controllable}
                draggable={isDraggable}
                opacity={tokenOpacity}
                tokenSize={effectiveSize}
                imageBounds={imageBounds}
                stageRef={stageRef}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
                onDragStart={broadcastTokenDragStart}
                onHpChange={handleHpChange}
              />
            );
          })}
        </Layer>

        {/* Fog paint preview outline — admin only, above tokens */}
        {isOwner && fogPreview && (
          <Layer listening={false}>
            <Rect
              x={fogPreview.x} y={fogPreview.y}
              width={fogPreview.w} height={fogPreview.h}
              fill="transparent"
              stroke={fogPreview.type === "reveal" ? "#22c55e" : "#ef4444"}
              strokeWidth={2 / stageScale}
              dash={[8 / stageScale, 4 / stageScale]}
            />
          </Layer>
        )}
      </Stage>

      {/* Fog of war toolbar — top-left, admin only */}
      {isOwner && (
        <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-gray-950/80 backdrop-blur-sm border border-gray-700 rounded-lg px-2 py-1.5">
          <button
            onClick={toggleFog}
            className={`text-xs px-2 py-1 rounded font-medium transition-colors ${
              session?.fog_enabled
                ? "bg-indigo-600 text-white hover:bg-indigo-500"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            Fog {session?.fog_enabled ? "On" : "Off"}
          </button>
          {session?.fog_enabled && (
            <>
              <div className="w-px h-4 bg-gray-700" />
              {(["reveal", "hide"] as const).map((tool) => (
                <button
                  key={tool}
                  onClick={() => activateFogTool(fogTool === tool ? null : tool)}
                  className={`text-xs px-2 py-1 rounded font-medium capitalize transition-colors ${
                    fogTool === tool
                      ? tool === "reveal"
                        ? "bg-green-700 text-white"
                        : "bg-red-800 text-white"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                  title={tool === "reveal" ? "Drag to reveal map area" : "Drag to re-fog map area"}
                >
                  {tool}
                </button>
              ))}
              <button
                onClick={clearFog}
                className="text-xs px-2 py-1 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                title="Remove all fog reveals"
              >
                Clear
              </button>
            </>
          )}
        </div>
      )}

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
