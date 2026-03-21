"use client";

import { useRef } from "react";
import { Group, Circle, Rect, Text } from "react-konva";
import type Konva from "konva";
import type { Token } from "@/types";
import { TOKEN_PADDING } from "@/lib/mapUtils";

export interface TokenShapeProps {
  token: Token;
  draggable: boolean;
  opacity: number;
  tokenSize: number;
  imageBounds: { x: number; y: number; width: number; height: number } | null;
  stageRef: React.RefObject<Konva.Stage | null>;
  onDragMove: (id: string, x: number, y: number) => void;
  onDragEnd: (id: string, x: number, y: number) => void;
  onDragStart: (id: string) => void;
}

export default function TokenShape({
  token, draggable, opacity, tokenSize,
  imageBounds, stageRef, onDragMove, onDragEnd, onDragStart,
}: TokenShapeProps) {
  const hpRatio = Math.max(0, token.hp / token.max_hp);
  const radius = tokenSize / 2;
  const barWidth = tokenSize;
  const barHeight = 6;
  const lastBroadcast = useRef(0);

  function getBoundedPosition(x: number, y: number) {
    if (!imageBounds) return { x, y };
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    return {
      x: clamp(x, imageBounds.x + radius + TOKEN_PADDING, imageBounds.x + imageBounds.width  - radius - TOKEN_PADDING),
      y: clamp(y, imageBounds.y + radius + TOKEN_PADDING, imageBounds.y + imageBounds.height - radius - TOKEN_PADDING),
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
        if (stageRef.current) stageRef.current.container().style.cursor = "grabbing";
      }}
      onDragMove={(e) => {
        const bounded = getBoundedPosition(e.target.x(), e.target.y());
        e.target.x(bounded.x);
        e.target.y(bounded.y);
        const now = Date.now();
        if (now - lastBroadcast.current >= 50) {
          lastBroadcast.current = now;
          onDragMove(token.id, bounded.x, bounded.y);
        }
      }}
      onDragEnd={(e) => {
        const bounded = getBoundedPosition(e.target.x(), e.target.y());
        onDragEnd(token.id, bounded.x, bounded.y);
        if (stageRef.current) stageRef.current.container().style.cursor = "grab";
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
    </Group>
  );
}
