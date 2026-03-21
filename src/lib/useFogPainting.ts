"use client";

import { useEffect, useRef, useState } from "react";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { createClient } from "@/lib/supabase/client";
import { useSessionStore } from "@/store/session";
import type { FogShape } from "@/types";

interface UseFogPaintingOptions {
  stageRef: React.RefObject<Konva.Stage | null>;
  stageScaleRef: { current: number };
  stagePosRef: { current: { x: number; y: number } };
  isOwner: boolean;
}

export function useFogPainting({ stageRef, stageScaleRef, stagePosRef, isOwner }: UseFogPaintingOptions) {
  const { setSession } = useSessionStore();

  const [fogTool, setFogToolState] = useState<"reveal" | "hide" | null>(null);
  const fogToolRef = useRef<"reveal" | "hide" | null>(null);
  const [fogPreview, setFogPreview] = useState<FogShape | null>(null);
  const isFogPainting = useRef(false);
  const fogPaintStart = useRef<{ x: number; y: number } | null>(null);

  const activateFogTool = (tool: "reveal" | "hide" | null) => {
    setFogToolState(tool);
    fogToolRef.current = tool;
  };

  // Cursor: crosshair when fog tool is active
  useEffect(() => {
    const container = stageRef.current?.container();
    if (container) container.style.cursor = fogTool ? "crosshair" : "";
  }, [fogTool, stageRef]);

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
    void e; // consumed
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
    fogTool,
    fogPreview,
    fogToolRef,
    isFogPaintingRef: isFogPainting,
    activateFogTool,
    toggleFog,
    clearFog,
    stageMouseDown,
    stageMouseMove,
    stageMouseUp,
    stageMouseLeave,
  };
}
