"use client";

import { Layer, Rect } from "react-konva";
import type { FogShape } from "@/types";
import { VIRTUAL_SIZE } from "@/lib/mapUtils";

interface FogLayerProps {
  fogShapes: FogShape[];
  fogPreview: FogShape | null;
  isOwner: boolean;
  mapWidth: number;
  mapHeight: number;
  fogColor: string;
  fogAdminOpacity: number;
}

export function FogLayer({ fogShapes, fogPreview, isOwner, mapWidth, mapHeight, fogColor, fogAdminOpacity }: FogLayerProps) {
  const fogOpacity = isOwner ? fogAdminOpacity : 1;
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
      <Rect x={0} y={0} width={VIRTUAL_SIZE} height={VIRTUAL_SIZE} fill={fogColor} />
      {fogShapes.map((shape, i) =>
        shape.type === "reveal"
          ? <Rect key={i} x={shape.x} y={shape.y} width={shape.w} height={shape.h}
              fill="black" globalCompositeOperation="destination-out" />
          : <Rect key={i} x={shape.x} y={shape.y} width={shape.w} height={shape.h}
              fill={fogColor} globalCompositeOperation="source-over" />
      )}
      {fogPreview && (
        fogPreview.type === "reveal"
          ? <Rect x={fogPreview.x} y={fogPreview.y} width={fogPreview.w} height={fogPreview.h}
              fill="black" globalCompositeOperation="destination-out" />
          : <Rect x={fogPreview.x} y={fogPreview.y} width={fogPreview.w} height={fogPreview.h}
              fill={fogColor} globalCompositeOperation="source-over" />
      )}
    </Layer>
  );
}

export function FogAdminOverlay({ fogShapes }: { fogShapes: FogShape[] }) {
  const reveals = fogShapes.filter(s => s.type === "reveal");
  if (reveals.length === 0) return null;
  return (
    <Layer listening={false}>
      {reveals.map((shape, i) => (
        <Rect key={i} x={shape.x} y={shape.y} width={shape.w} height={shape.h}
          fill="rgba(34,197,94,0.25)" />
      ))}
    </Layer>
  );
}

export function FogPreviewOutline({ preview, stageScale, fogPreviewStroke }: {
  preview: FogShape;
  stageScale: number;
  fogPreviewStroke: string;
}) {
  return (
    <Layer listening={false}>
      <Rect
        x={preview.x} y={preview.y}
        width={preview.w} height={preview.h}
        fill="transparent"
        stroke={fogPreviewStroke}
        strokeWidth={2 / stageScale}
        dash={[8 / stageScale, 4 / stageScale]}
      />
    </Layer>
  );
}
