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
  /** Used to clamp selections that end outside the canvas to map boundaries */
  imageBounds: { x: number; y: number; width: number; height: number } | null;
}

export function useFogPainting({ stageRef, stageScaleRef, stagePosRef, isOwner, fogTool, imageBounds }: UseFogPaintingOptions) {
  const { setSession } = useSessionStore();

  // Ref mirrors so event handlers registered once always see the latest values
  const fogToolRef = useRef<"reveal" | "hide" | null>(fogTool);
  useEffect(() => { fogToolRef.current = fogTool; }, [fogTool]);

  const imageBoundsRef = useRef(imageBounds);
  useEffect(() => { imageBoundsRef.current = imageBounds; }, [imageBounds]);

  const [fogPreview, setFogPreview] = useState<FogShape | null>(null);
  const isFogPainting = useRef(false);
  const fogPaintStart = useRef<{ x: number; y: number } | null>(null);

  // Cursor: crosshair when a fog tool is active
  useEffect(() => {
    const container = stageRef.current?.container();
    if (container) container.style.cursor = fogTool ? "crosshair" : "";
  }, [fogTool, stageRef]);

  /** Convert browser client coordinates to Konva world coordinates. */
  const clientToWorld = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const container = stageRef.current?.container();
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    return {
      x: (clientX - rect.left - stagePosRef.current.x) / stageScaleRef.current,
      y: (clientY - rect.top - stagePosRef.current.y) / stageScaleRef.current,
    };
  };

  /** Clamp world coordinates to map image bounds (no-op when no image is loaded). */
  const clampToMap = (wx: number, wy: number): { x: number; y: number } => {
    const b = imageBoundsRef.current;
    if (!b) return { x: wx, y: wy };
    return {
      x: Math.max(0, Math.min(b.width, wx)),
      y: Math.max(0, Math.min(b.height, wy)),
    };
  };

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

  // Document-level listeners handle all mouse movement and release — including outside the canvas.
  // Registered once; all values are read via refs to avoid stale closures.
  useEffect(() => {
    const handleDocMouseMove = (e: MouseEvent) => {
      if (!isFogPainting.current || !fogPaintStart.current) return;
      const world = clientToWorld(e.clientX, e.clientY);
      if (!world) return;
      const { x: wx, y: wy } = clampToMap(world.x, world.y);
      const start = fogPaintStart.current;
      setFogPreview({
        x: Math.min(start.x, wx), y: Math.min(start.y, wy),
        w: Math.abs(wx - start.x), h: Math.abs(wy - start.y),
        type: fogToolRef.current!,
      });
    };

    const handleDocMouseUp = (e: MouseEvent) => {
      if (!isFogPainting.current) return;
      isFogPainting.current = false;
      const start = fogPaintStart.current;
      fogPaintStart.current = null;
      setFogPreview(null);
      if (start) {
        const world = clientToWorld(e.clientX, e.clientY);
        if (world) {
          const { x: wx, y: wy } = clampToMap(world.x, world.y);
          const shape: FogShape = {
            x: Math.min(start.x, wx), y: Math.min(start.y, wy),
            w: Math.abs(wx - start.x), h: Math.abs(wy - start.y),
            type: fogToolRef.current!,
          };
          if (shape.w > 4 && shape.h > 4) void commitFogShape(shape);
        }
      }
    };

    document.addEventListener("mousemove", handleDocMouseMove);
    document.addEventListener("mouseup", handleDocMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleDocMouseMove);
      document.removeEventListener("mouseup", handleDocMouseUp);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // stageMouseMove and stageMouseUp only need to return true to block pan logic.
  // Actual preview updates and shape commits are handled by the document-level listeners above.
  const stageMouseMove = (): boolean => isFogPainting.current;

  const stageMouseUp = (): boolean => isFogPainting.current;

  const stageMouseLeave = (): boolean => {
    // No longer cancel painting on leave — document-level mouseup handles cleanup.
    return false;
  };

  return {
    fogPreview,
    stageMouseDown,
    stageMouseMove,
    stageMouseUp,
    stageMouseLeave,
  };
}
