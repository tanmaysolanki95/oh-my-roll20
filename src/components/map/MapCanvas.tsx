"use client";

import { useRef, useMemo } from "react";
import { Stage, Layer, Image as KonvaImage, Line, Rect } from "react-konva";
import useImage from "use-image";
import { createClient } from "@/lib/supabase/client";
import { useSessionStore } from "@/store/session";
import { useAuth } from "@/lib/useAuth";
import { clampStagePos, GRID_COLOR, DEFAULT_TOKEN_SIZE, VIRTUAL_SIZE, SCALE_BY } from "@/lib/mapUtils";
import { useImageSize } from "@/lib/useImageSize";
import { useMapZoom } from "@/lib/useMapZoom";
import { useFogPainting } from "@/lib/useFogPainting";
import TokenShape from "./TokenShape";
import { FogLayer, FogAdminOverlay, FogPreviewOutline } from "./FogLayer";
import MapControls from "./MapControls";

interface MapCanvasProps {
  sessionId: string;
  broadcastTokenMove: (id: string, x: number, y: number) => void;
  broadcastTokenDragStart: (token_id: string) => void;
  broadcastTokenDragEnd: (token_id: string) => void;
  lockedBy: Record<string, string>;
  /** Fog tool controlled by SessionView (DM tab) */
  fogTool: "reveal" | "hide" | null;
  /** Token size preview: non-null while DM is dragging the session size slider */
  pendingTokenSize: number | null;
  /** Which tokens the session-level size slider affects */
  tokenSizeScope: "all" | "players";
}

function MapBackground({ url, width, height }: { url: string; width: number; height: number }) {
  const [image] = useImage(url);
  return <KonvaImage name="background" image={image} width={width} height={height} />;
}

export default function MapCanvas({
  broadcastTokenMove, broadcastTokenDragStart, broadcastTokenDragEnd,
  lockedBy, fogTool, pendingTokenSize, tokenSizeScope,
}: MapCanvasProps) {
  useAuth();

  const { session, tokens, updateTokenPosition, upsertToken, userId } = useSessionStore();
  const isOwner = !!userId && session?.owner_id === userId;
  const canControl = (tokenOwnerId: string | null) => isOwner || tokenOwnerId === userId;

  const mapUrl = session?.map_url ?? null;
  const imageSize = useImageSize(mapUrl);
  const imageBounds = mapUrl && imageSize.width > 0 ? { x: 0, y: 0, ...imageSize } : null;

  const zoom = useMapZoom(imageBounds);
  const fog = useFogPainting({
    stageRef: zoom.stageRef,
    stageScaleRef: zoom.stageScaleRef,
    stagePosRef: zoom.stagePosRef,
    isOwner,
    fogTool,
  });

  // Panning
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panOrigin = useRef({ x: 0, y: 0 });

  const handleDragMove = (id: string, x: number, y: number) => {
    broadcastTokenMove(id, x, y);
  };

  const handleDragEnd = async (id: string, x: number, y: number) => {
    updateTokenPosition(id, x, y);
    broadcastTokenDragEnd(id);
    await createClient().from("tokens").update({ x, y }).eq("id", id);
  };

  // Grid lines (memoized)
  const gridSize = session?.grid_size ?? 60;
  const gridWidth = mapUrl && imageSize.width > 0 ? imageSize.width : VIRTUAL_SIZE;
  const gridHeight = mapUrl && imageSize.height > 0 ? imageSize.height : VIRTUAL_SIZE;
  const gridLines = useMemo(() => {
    const lines: React.ReactElement[] = [];
    for (let x = 0; x <= gridWidth; x += gridSize)
      lines.push(<Line key={`v${x}`} points={[x, 0, x, gridHeight]} stroke={GRID_COLOR} strokeWidth={1} />);
    for (let y = 0; y <= gridHeight; y += gridSize)
      lines.push(<Line key={`h${y}`} points={[0, y, gridWidth, y]} stroke={GRID_COLOR} strokeWidth={1} />);
    return lines;
  }, [gridSize, gridWidth, gridHeight]);

  return (
    <div ref={zoom.containerRef} className="w-full h-full bg-gray-900 rounded-lg overflow-hidden relative">
      <Stage
        ref={zoom.stageRef}
        width={zoom.size.width}
        height={zoom.size.height}
        scaleX={zoom.stageScale}
        scaleY={zoom.stageScale}
        x={zoom.stagePos.x}
        y={zoom.stagePos.y}
        onWheel={zoom.handleWheel}
        onMouseDown={(e) => {
          if (fog.stageMouseDown(e)) return;
          if (e.target.name() === "background" || e.target.getClassName() === "Line") {
            isPanning.current = true;
            panStart.current = { x: e.evt.clientX, y: e.evt.clientY };
            panOrigin.current = { ...zoom.stagePosRef.current };
          }
        }}
        onMouseMove={(e) => {
          if (fog.stageMouseMove()) return;
          if (!isPanning.current) return;
          const raw = {
            x: panOrigin.current.x + (e.evt.clientX - panStart.current.x),
            y: panOrigin.current.y + (e.evt.clientY - panStart.current.y),
          };
          const newPos = clampStagePos(raw, zoom.stageScaleRef.current, zoom.sizeRef.current, zoom.imageBoundsRef.current);
          zoom.stagePosRef.current = newPos;
          zoom.setStagePos(newPos);
        }}
        onMouseUp={() => {
          if (fog.stageMouseUp()) return;
          isPanning.current = false;
        }}
        onMouseLeave={() => {
          if (fog.stageMouseLeave()) return;
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
            fogPreview={fog.fogPreview}
            isOwner={isOwner}
          />
        )}

        {/* Layer 3 — admin reveal tints */}
        {isOwner && session?.fog_enabled && (
          <FogAdminOverlay fogShapes={session.fog_shapes ?? []} />
        )}

        {/* Layer 4 — tokens (always above fog) */}
        <Layer>
          {tokens.filter(t => isOwner || (t.visible ?? true)).map((token) => {
            const controllable = canControl(token.owner_id);
            const isLockedByOwner = token.owner_id !== null && lockedBy[token.id] === token.owner_id;
            const isDead = token.hp === 0;
            const inSizeScope = tokenSizeScope === "all" || token.owner_id !== null;
            const baseOpacity = isOwner && !(token.visible ?? true) ? 0.35 : isDead ? 0.5 : 1;
            return (
              <TokenShape
                key={token.id}
                token={token}
                draggable={controllable && !(isOwner && isLockedByOwner) && (!isDead || isOwner)}
                opacity={pendingTokenSize !== null && !inSizeScope ? 0.25 : baseOpacity}
                tokenSize={pendingTokenSize !== null && inSizeScope ? pendingTokenSize : (token.size ?? DEFAULT_TOKEN_SIZE)}
                imageBounds={imageBounds}
                stageRef={zoom.stageRef}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
                onDragStart={broadcastTokenDragStart}
              />
            );
          })}
        </Layer>

        {/* Layer 5 — fog paint preview outline (admin only, above tokens) */}
        {isOwner && fog.fogPreview && (
          <FogPreviewOutline preview={fog.fogPreview} stageScale={zoom.stageScale} />
        )}
      </Stage>

      {/* Zoom controls — movable & hidable */}
      <MapControls
        stageScale={zoom.stageScale}
        onZoomIn={() => zoom.zoomBy(SCALE_BY)}
        onZoomOut={() => zoom.zoomBy(1 / SCALE_BY)}
        onResetView={zoom.resetView}
      />
    </div>
  );
}
