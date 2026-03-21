"use client";

import { Layer, Rect } from "react-konva";
import type { FogShape } from "@/types";
import { VIRTUAL_SIZE } from "@/lib/mapUtils";

interface FogLayerProps {
  fogShapes: FogShape[];
  fogPreview: FogShape | null;
  isOwner: boolean;
  /** Map image dimensions — used to color inside vs outside map differently */
  mapWidth: number;
  mapHeight: number;
}

/** Main fog layer — covers the entire virtual canvas and punches holes for reveals.
 *  Outside the map bounds: solid black.
 *  Inside the map bounds (fogged): dark navy blue — so players can always
 *  tell where the map begins and ends even with full fog. */
export function FogLayer({ fogShapes, fogPreview, isOwner, mapWidth, mapHeight }: FogLayerProps) {
  const fogFill = "#0f172a"; // dark navy — visible as blue-tinted vs pure black outside
  const fogOpacity = isOwner ? 0.72 : 1;
  const hasMap = mapWidth > 0 && mapHeight > 0;

  return (
    <Layer
      listening={false}
      opacity={fogOpacity}
      clipX={0}
      clipY={0}
      clipWidth={hasMap ? mapWidth : VIRTUAL_SIZE}
      clipHeight={hasMap ? mapHeight : VIRTUAL_SIZE}
    >
      {/* Full-canvas base rect (VIRTUAL_SIZE prevents sub-pixel edge bleed at high zoom) */}
      <Rect x={0} y={0} width={VIRTUAL_SIZE} height={VIRTUAL_SIZE} fill={fogFill} />
      {fogShapes.map((shape, i) =>
        shape.type === "reveal"
          ? <Rect key={i} x={shape.x} y={shape.y} width={shape.w} height={shape.h}
              fill="black" globalCompositeOperation="destination-out" />
          : <Rect key={i} x={shape.x} y={shape.y} width={shape.w} height={shape.h}
              fill={fogFill} globalCompositeOperation="source-over" />
      )}
      {fogPreview && (
        fogPreview.type === "reveal"
          ? <Rect x={fogPreview.x} y={fogPreview.y} width={fogPreview.w} height={fogPreview.h}
              fill="black" globalCompositeOperation="destination-out" />
          : <Rect x={fogPreview.x} y={fogPreview.y} width={fogPreview.w} height={fogPreview.h}
              fill={fogFill} globalCompositeOperation="source-over" />
      )}
    </Layer>
  );
}

/** Admin-only overlay: green tint over revealed areas so boundaries are obvious. */
export function FogAdminOverlay({ fogShapes }: { fogShapes: FogShape[] }) {
  const reveals = fogShapes.filter(s => s.type === "reveal");
  if (reveals.length === 0) return null;
  return (
    <Layer listening={false}>
      {reveals.map((shape, i) => (
        <Rect
          key={i}
          x={shape.x} y={shape.y}
          width={shape.w} height={shape.h}
          fill="rgba(34,197,94,0.25)"
        />
      ))}
    </Layer>
  );
}

/** Admin paint preview outline — shown above tokens while dragging a fog shape. */
export function FogPreviewOutline({ preview, stageScale }: { preview: FogShape; stageScale: number }) {
  return (
    <Layer listening={false}>
      <Rect
        x={preview.x} y={preview.y}
        width={preview.w} height={preview.h}
        fill="transparent"
        stroke={preview.type === "reveal" ? "#22c55e" : "#ef4444"}
        strokeWidth={2 / stageScale}
        dash={[8 / stageScale, 4 / stageScale]}
      />
    </Layer>
  );
}
