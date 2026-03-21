"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { clampStagePos, SCALE_BY, MIN_SCALE, MAX_SCALE } from "./mapUtils";

type Bounds = { x: number; y: number; width: number; height: number } | null;

export function useMapZoom(imageBounds: Bounds) {
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [size, setSize] = useState({ width: 800, height: 600 });
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });

  // Refs for stale closure prevention in event handlers
  const stageScaleRef = useRef(stageScale);
  const stagePosRef = useRef(stagePos);
  const sizeRef = useRef(size);
  const imageBoundsRef = useRef(imageBounds);

  useEffect(() => { stageScaleRef.current = stageScale; }, [stageScale]);
  useEffect(() => { stagePosRef.current = stagePos; }, [stagePos]);
  useEffect(() => { sizeRef.current = size; }, [size]);
  useEffect(() => { imageBoundsRef.current = imageBounds; }, [imageBounds]);

  // Responsive canvas sizing — also re-clamp pos so map stays in view when sidebar resizes
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ width, height });
      const newPos = clampStagePos(stagePosRef.current, stageScaleRef.current, { width, height }, imageBoundsRef.current);
      if (newPos.x !== stagePosRef.current.x || newPos.y !== stagePosRef.current.y) {
        stagePosRef.current = newPos;
        setStagePos(newPos);
      }
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const minZoom = imageBounds
    ? Math.min(size.width / imageBounds.width, size.height / imageBounds.height)
    : MIN_SCALE;

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
    const bounds = imageBoundsRef.current;
    if (!bounds) {
      setStageScale(minZoom);
      setStagePos({ x: 0, y: 0 });
      stagePosRef.current = { x: 0, y: 0 };
      return;
    }
    const fitScale = Math.min(sizeRef.current.width / bounds.width, sizeRef.current.height / bounds.height);
    const newPos = {
      x: (sizeRef.current.width - bounds.width * fitScale) / 2,
      y: (sizeRef.current.height - bounds.height * fitScale) / 2,
    };
    setStageScale(fitScale);
    setStagePos(newPos);
    stagePosRef.current = newPos;
  }, [minZoom]);

  return {
    stageRef,
    containerRef,
    size,
    stageScale,
    stagePos,
    stageScaleRef,
    stagePosRef,
    sizeRef,
    imageBoundsRef,
    setStagePos,
    minZoom,
    handleWheel,
    zoomBy,
    resetView,
  };
}
