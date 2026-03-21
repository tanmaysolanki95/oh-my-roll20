"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Stage, Layer, Image as KonvaImage, Line, Rect } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type Konva from "konva";
import useImage from "use-image";
import { createClient } from "@/lib/supabase/client";
import { useSessionStore } from "@/store/session";
import type { FogShape } from "@/types";
import { useAuth } from "@/lib/useAuth";
import { clampStagePos, GRID_COLOR, DEFAULT_TOKEN_SIZE, VIRTUAL_SIZE, SCALE_BY, MIN_SCALE, MAX_SCALE } from "@/lib/mapUtils";
import { useImageSize } from "@/lib/useImageSize";
import TokenShape from "./TokenShape";
import { FogLayer, FogAdminOverlay, FogPreviewOutline } from "./FogLayer";
import FogToolbar from "./FogToolbar";
import MapControls from "./MapControls";

interface MapCanvasProps {
  sessionId: string;
  broadcastTokenMove: (id: string, x: number, y: number) => void;
  broadcastTokenDragStart: (token_id: string) => void;
  broadcastTokenDragEnd: (token_id: string) => void;
  lockedBy: Record<string, string>;
}

function MapBackground({ url, width, height }: { url: string; width: number; height: number }) {
  const [image] = useImage(url);
  return <KonvaImage name="background" image={image} width={width} height={height} />;
}

export default function MapCanvas({ broadcastTokenMove, broadcastTokenDragStart, broadcastTokenDragEnd, lockedBy }: MapCanvasProps) {
  useAuth();

  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
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
  useEffect(() => { stageScaleRef.current = stageScale; }, [stageScale]);
  useEffect(() => { stagePosRef.current = stagePos; }, [stagePos]);
  useEffect(() => { sizeRef.current = size; }, [size]);

  // Panning state
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panOrigin = useRef({ x: 0, y: 0 });

  const { session, tokens, updateTokenPosition, setSession, userId } = useSessionStore();
  const isOwner = !!userId && session?.owner_id === userId;
  const canControl = (tokenOwnerId: string | null) => isOwner || tokenOwnerId === userId;

  const mapUrl = session?.map_url ?? null;
  const imageSize = useImageSize(mapUrl);
  const imageBounds = mapUrl && imageSize.width > 0 ? { x: 0, y: 0, ...imageSize } : null;
  const imageBoundsRef = useRef(imageBounds);
  useEffect(() => { imageBoundsRef.current = imageBounds; }, [imageBounds]);

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

  // Cursor: crosshair when fog tool is active
  useEffect(() => {
    const container = stageRef.current?.container();
    if (container) container.style.cursor = fogTool ? "crosshair" : "";
  }, [fogTool]);

  // ---------------------------------------------------------------------------
  // Zoom
  // ---------------------------------------------------------------------------
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
    const newScale = Math.max(minZoom, Math.min(MAX_SCALE, stageScaleRef.current * factor));
    setZoom(newScale);
  }, [setZoom, minZoom]);

  const handleWheel = useCallback((e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;
    const direction = e.evt.deltaY < 0 ? 1 : -1;
    const newScale = Math.max(minZoom, Math.min(MAX_SCALE,
      direction > 0 ? stageScaleRef.current * SCALE_BY : stageScaleRef.current / SCALE_BY
    ));
    setZoom(newScale, pointer.x, pointer.y);
  }, [setZoom, minZoom]);

  const resetView = useCallback(() => {
    if (!imageBounds) {
      setStageScale(minZoom); setStagePos({ x: 0, y: 0 }); stagePosRef.current = { x: 0, y: 0 };
      return;
    }
    const fitScale = Math.min(size.width / imageBounds.width, size.height / imageBounds.height);
    const newPos = { x: (size.width - imageBounds.width * fitScale) / 2, y: (size.height - imageBounds.height * fitScale) / 2 };
    setStageScale(fitScale); setStagePos(newPos); stagePosRef.current = newPos;
  }, [imageBounds, size, minZoom]);

  // ---------------------------------------------------------------------------
  // Token handlers
  // ---------------------------------------------------------------------------
  const handleDragMove = useCallback((id: string, x: number, y: number) => {
    broadcastTokenMove(id, x, y);
  }, [broadcastTokenMove]);

  const handleDragEnd = async (id: string, x: number, y: number) => {
    updateTokenPosition(id, x, y);
    broadcastTokenDragEnd(id);
    await createClient().from("tokens").update({ x, y }).eq("id", id);
  };

  const handleTokenSizeCommit = async (newSize: number) => {
    const s = useSessionStore.getState().session;
    if (!s) return;
    setSession({ ...s, token_size: newSize });
    await createClient().from("sessions").update({ token_size: newSize }).eq("id", s.id);
  };

  // ---------------------------------------------------------------------------
  // Fog operations
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Grid lines
  // ---------------------------------------------------------------------------
  const gridSize = session?.grid_size ?? 60;
  const gridWidth = mapUrl && imageSize.width > 0 ? imageSize.width : VIRTUAL_SIZE;
  const gridHeight = mapUrl && imageSize.height > 0 ? imageSize.height : VIRTUAL_SIZE;
  const gridLines: React.ReactElement[] = [];
  for (let x = 0; x <= gridWidth; x += gridSize)
    gridLines.push(<Line key={`v${x}`} points={[x, 0, x, gridHeight]} stroke={GRID_COLOR} strokeWidth={1} />);
  for (let y = 0; y <= gridHeight; y += gridSize)
    gridLines.push(<Line key={`h${y}`} points={[0, y, gridWidth, y]} stroke={GRID_COLOR} strokeWidth={1} />);

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
        onWheel={handleWheel}
        onMouseDown={(e) => {
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
              x: Math.min(start.x, wx), y: Math.min(start.y, wy),
              w: Math.abs(wx - start.x), h: Math.abs(wy - start.y),
              type: fogToolRef.current!,
            });
            return;
          }
          if (!isPanning.current) return;
          const raw = {
            x: panOrigin.current.x + (e.evt.clientX - panStart.current.x),
            y: panOrigin.current.y + (e.evt.clientY - panStart.current.y),
          };
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
                  x: Math.min(start.x, wx), y: Math.min(start.y, wy),
                  w: Math.abs(wx - start.x), h: Math.abs(wy - start.y),
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
        {/* Layer 1 — background: map image + grid */}
        <Layer>
          <Rect name="background" x={0} y={0} width={VIRTUAL_SIZE} height={VIRTUAL_SIZE} fill="rgba(0,0,0,0.001)" />
          {mapUrl && imageSize.width > 0
            ? <MapBackground url={mapUrl} width={imageSize.width} height={imageSize.height} />
            : <Rect name="background" width={VIRTUAL_SIZE} height={VIRTUAL_SIZE} fill="#1f2937" />
          }
          {gridLines}
        </Layer>

        {/* Layer 2 — fog of war */}
        {session?.fog_enabled && (
          <FogLayer
            fogShapes={session.fog_shapes ?? []}
            fogPreview={fogPreview}
            isOwner={isOwner}
          />
        )}

        {/* Layer 3 — admin reveal tints (visible only to admin) */}
        {isOwner && session?.fog_enabled && (
          <FogAdminOverlay fogShapes={session.fog_shapes ?? []} />
        )}

        {/* Layer 4 — tokens (always above fog) */}
        <Layer>
          {tokens.filter(t => isOwner || (t.visible ?? true)).map((token) => {
            const controllable = canControl(token.owner_id);
            const isLockedByOwner = token.owner_id !== null && lockedBy[token.id] === token.owner_id;
            const isDead = token.hp === 0;
            return (
              <TokenShape
                key={token.id}
                token={token}
                draggable={controllable && !(isOwner && isLockedByOwner) && (!isDead || isOwner)}
                opacity={isOwner && !(token.visible ?? true) ? 0.35 : isDead ? 0.5 : 1}
                tokenSize={token.size ?? DEFAULT_TOKEN_SIZE}
                imageBounds={imageBounds}
                stageRef={stageRef}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
                onDragStart={broadcastTokenDragStart}
              />
            );
          })}
        </Layer>

        {/* Layer 5 — fog paint preview outline (admin only, above tokens) */}
        {isOwner && fogPreview && (
          <FogPreviewOutline preview={fogPreview} stageScale={stageScale} />
        )}
      </Stage>

      {/* HTML overlays */}
      {isOwner && (
        <FogToolbar
          fogEnabled={session?.fog_enabled ?? false}
          fogTool={fogTool}
          onToggleFog={toggleFog}
          onActivateTool={activateFogTool}
          onClearFog={clearFog}
        />
      )}
      <MapControls
        isOwner={isOwner}
        session={session}
        stageScale={stageScale}
        pendingTokenSize={pendingTokenSize}
        onPendingTokenSize={setPendingTokenSize}
        onTokenSizeCommit={handleTokenSizeCommit}
        onZoomIn={() => zoomBy(SCALE_BY)}
        onZoomOut={() => zoomBy(1 / SCALE_BY)}
        onResetView={resetView}
      />
    </div>
  );
}
