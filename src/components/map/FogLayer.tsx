"use client";

import { Layer, Rect } from "react-konva";
import type { FogShape } from "@/types";
import { VIRTUAL_SIZE } from "@/lib/mapUtils";

interface FogLayerProps {
  fogShapes: FogShape[];
  fogPreview: FogShape | null;
  isOwner: boolean;
}

/** Main fog layer — covers the entire virtual canvas and punches holes for reveals. */
export function FogLayer({ fogShapes, fogPreview, isOwner }: FogLayerProps) {
  // Admin: semi-transparent indigo so the map is still readable.
  // Players: fully opaque black — nothing bleeds through.
  const fogFill = isOwner ? "#1e1b4b" : "black";
  const fogOpacity = isOwner ? 0.65 : 1;

  return (
    <Layer listening={false} opacity={fogOpacity}>
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
