"use client";

import { useEffect, useRef, useState } from "react";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { useSessionStore } from "@/store/session";
import type { FogShape } from "@/types";

const MAX_FOG_HISTORY = 50;

interface UseFogPaintingOptions {
  stageRef: React.RefObject<Konva.Stage | null>;
  stageScaleRef: { current: number };
  stagePosRef: { current: { x: number; y: number } };
  isOwner: boolean;
  /** Controlled from outside — SessionView owns the active tool selection */
  fogTool: "reveal" | "hide" | null;
}

export function useFogPainting({ stageRef, stageScaleRef, stagePosRef, isOwner, fogTool }: UseFogPaintingOptions) {
  const { setSession } = useSessionStore();

  // Ref mirror so mouse event handlers (registered once) always see the latest value
  const fogToolRef = useRef<"reveal" | "hide" | null>(fogTool);
  useEffect(() => { fogToolRef.current = fogTool; }, [fogTool]);

  const [fogPreview, setFogPreview] = useState<FogShape | null>(null);
  const isFogPainting = useRef(false);
  const fogPaintStart = useRef<{ x: number; y: number } | null>(null);

  // Cursor: crosshair when a fog tool is active
  useEffect(() => {
    const container = stageRef.current?.container();
    if (container) container.style.cursor = fogTool ? "crosshair" : "";
  }, [fogTool, stageRef]);

  const commitFogShape = async (shape: FogShape) => {
    const s = useSessionStore.getState().session;
    if (!s) return;
    const prevShapes = s.fog_shapes ?? [];
    const prevHistory = s.fog_history ?? [];

    // Push current fog_shapes as a snapshot; drop oldest if at cap
    const trimmed = prevHistory.length >= MAX_FOG_HISTORY
      ? prevHistory.slice(1)
      : prevHistory;
    const newHistory = [...trimmed, prevShapes];
    const newShapes = [...prevShapes, shape];

    setSession({ ...s, fog_shapes: newShapes, fog_history: newHistory });
    const { createClient } = await import("@/lib/supabase/client");
    await createClient()
      .from("sessions")
      .update({ fog_shapes: newShapes, fog_history: newHistory })
      .eq("id", s.id);
  };

  /** Returns true if fog consumed the event (caller should skip pan logic). */
  const stageMouseDown = (e: KonvaEventObject<MouseEvent>): boolean => {
    if (!fogToolRef.current || !isOwner) return false;
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return false;
    const wx = (pointer.x - stagePosRef.current.x) / stageScaleRef.current;
    const wy = (pointer.y - stagePosRef.current.y) / stageScaleRef.current;
    isFogPainting.current = true;
    fogPaintStart.current = { x: wx, y: wy };
    setFogPreview({ x: wx, y: wy, w: 0, h: 0, type: fogToolRef.current });
    void e;
    return true;
  };

  const stageMouseMove = (): boolean => {
    if (!isFogPainting.current || !fogPaintStart.current) return false;
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return false;
    const wx = (pointer.x - stagePosRef.current.x) / stageScaleRef.current;
    const wy = (pointer.y - stagePosRef.current.y) / stageScaleRef.current;
    const start = fogPaintStart.current;
    setFogPreview({
      x: Math.min(start.x, wx), y: Math.min(start.y, wy),
      w: Math.abs(wx - start.x), h: Math.abs(wy - start.y),
      type: fogToolRef.current!,
    });
    return true;
  };

  const stageMouseUp = (): boolean => {
    if (!isFogPainting.current) return false;
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
        if (shape.w > 4 && shape.h > 4) void commitFogShape(shape);
      }
    }
    return true;
  };

  const stageMouseLeave = (): boolean => {
    if (!isFogPainting.current) return false;
    isFogPainting.current = false;
    fogPaintStart.current = null;
    setFogPreview(null);
    return true;
  };

  return {
    fogPreview,
    stageMouseDown,
    stageMouseMove,
    stageMouseUp,
    stageMouseLeave,
  };
}
