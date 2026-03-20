"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Stage, Layer, Image as KonvaImage, Line, Group, Circle, Rect, Text } from "react-konva";
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

function TokenShape({ token, gridSize, canControl, onDragMove, onDragEnd, onHpChange }: {
  token: Token;
  gridSize: number;
  canControl: boolean;
  onDragMove: (id: string, x: number, y: number) => void;
  onDragEnd: (id: string, x: number, y: number) => void;
  onHpChange: (token: Token, delta: number) => void;
}) {
  const hpRatio = Math.max(0, token.hp / token.max_hp);
  const barWidth = TOKEN_RADIUS * 2;
  const barHeight = 6;
  // Throttle broadcasts to ~20 per second — smooth enough without flooding
  const lastBroadcast = useRef(0);

  return (
    <Group
      x={token.x}
      y={token.y}
      draggable={canControl}
      onDragMove={(e) => {
        // Do NOT snap or update the store here — let Konva own the position
        // during drag. Only broadcast the raw position (throttled).
        const now = Date.now();
        if (now - lastBroadcast.current >= 50) {
          lastBroadcast.current = now;
          onDragMove(token.id, e.target.x(), e.target.y());
        }
      }}
      onDragEnd={(e) => {
        // Snap to grid only on drop
        const snappedX = Math.round(e.target.x() / gridSize) * gridSize;
        const snappedY = Math.round(e.target.y() / gridSize) * gridSize;
        e.target.position({ x: snappedX, y: snappedY });
        onDragEnd(token.id, snappedX, snappedY);
      }}
    >
      {/* Token circle */}
      <Circle
        radius={TOKEN_RADIUS}
        fill={token.color}
        stroke="white"
        strokeWidth={2}
        shadowBlur={6}
        shadowColor="black"
        shadowOpacity={0.4}
      />

      {/* Name label */}
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

      {/* HP bar background */}
      <Rect
        x={-TOKEN_RADIUS}
        y={TOKEN_RADIUS + 4}
        width={barWidth}
        height={barHeight}
        fill="#374151"
        cornerRadius={3}
      />
      {/* HP bar fill */}
      <Rect
        x={-TOKEN_RADIUS}
        y={TOKEN_RADIUS + 4}
        width={barWidth * hpRatio}
        height={barHeight}
        fill={hpRatio > 0.5 ? "#22c55e" : hpRatio > 0.25 ? "#eab308" : "#ef4444"}
        cornerRadius={3}
      />

      {/* HP click zones — only rendered for tokens you can control */}
      {canControl && (
        <>
          <Circle
            radius={10}
            x={-TOKEN_RADIUS - 14}
            y={0}
            fill="rgba(0,0,0,0.5)"
            stroke="#6b7280"
            strokeWidth={1}
            onClick={() => onHpChange(token, -1)}
            onTap={() => onHpChange(token, -1)}
          />
          <Text
            text="−"
            x={-TOKEN_RADIUS - 21}
            y={-7}
            fontSize={13}
            fill="white"
            onClick={() => onHpChange(token, -1)}
            onTap={() => onHpChange(token, -1)}
          />
          <Circle
            radius={10}
            x={TOKEN_RADIUS + 14}
            y={0}
            fill="rgba(0,0,0,0.5)"
            stroke="#6b7280"
            strokeWidth={1}
            onClick={() => onHpChange(token, 1)}
            onTap={() => onHpChange(token, 1)}
          />
          <Text
            text="+"
            x={TOKEN_RADIUS + 8}
            y={-7}
            fontSize={13}
            fill="white"
            onClick={() => onHpChange(token, 1)}
            onTap={() => onHpChange(token, 1)}
          />
        </>
      )}
    </Group>
  );
}

function MapBackground({ url, width, height }: { url: string; width: number; height: number }) {
  const [image] = useImage(url);
  return <KonvaImage image={image} width={width} height={height} />;
}

export default function MapCanvas({ sessionId, broadcastTokenMove }: MapCanvasProps) {
  useAuth(); // MapCanvas is SSR-disabled so safe to call here
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const { session, tokens, updateTokenPosition, upsertToken, userId } = useSessionStore();

  const isOwner = !!userId && session?.owner_id === userId;
  const canControl = (tokenOwnerId: string | null) =>
    isOwner || tokenOwnerId === userId;

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

  const handleDragMove = useCallback((id: string, x: number, y: number) => {
    // Only broadcast — don't touch the store while dragging.
    // Updating the store mid-drag causes React to re-set x/y props on the
    // Konva node, which fights the drag and produces the jumpy movement.
    broadcastTokenMove(id, x, y);
  }, [broadcastTokenMove]);

  const handleDragEnd = async (id: string, x: number, y: number) => {
    updateTokenPosition(id, x, y);
    const supabase = createClient();
    await supabase.from("tokens").update({ x, y }).eq("id", id);
  };

  const handleHpChange = async (token: Token, delta: number) => {
    const newHp = Math.max(0, Math.min(token.max_hp, token.hp + delta));
    upsertToken({ ...token, hp: newHp }); // optimistic
    const supabase = createClient();
    await supabase.from("tokens").update({ hp: newHp }).eq("id", token.id);
  };

  // Grid lines
  const gridLines: React.ReactElement[] = [];
  for (let x = 0; x < size.width; x += gridSize) {
    gridLines.push(
      <Line key={`v${x}`} points={[x, 0, x, size.height]} stroke={GRID_COLOR} strokeWidth={1} />
    );
  }
  for (let y = 0; y < size.height; y += gridSize) {
    gridLines.push(
      <Line key={`h${y}`} points={[0, y, size.width, y]} stroke={GRID_COLOR} strokeWidth={1} />
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full bg-gray-900 rounded-lg overflow-hidden">
      <Stage width={size.width} height={size.height}>
        {/* Map background layer */}
        <Layer>
          {mapUrl ? (
            <MapBackground url={mapUrl} width={size.width} height={size.height} />
          ) : (
            // Dark grid placeholder when no map is uploaded
            <Rect width={size.width} height={size.height} fill="#1f2937" />
          )}
          {gridLines}
        </Layer>

        {/* Token layer */}
        <Layer>
          {tokens.map((token) => (
            <TokenShape
              key={token.id}
              token={token}
              gridSize={gridSize}
              canControl={canControl(token.owner_id)}
              onDragMove={handleDragMove}
              onDragEnd={handleDragEnd}
              onHpChange={handleHpChange}
            />
          ))}
        </Layer>
      </Stage>
    </div>
  );
}
