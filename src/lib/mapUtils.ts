// ---------------------------------------------------------------------------
// Map constants — shared across MapCanvas and its sub-components
// ---------------------------------------------------------------------------
export const GRID_COLOR = "rgba(255,255,255,0.15)";
export const DEFAULT_TOKEN_SIZE = 56;
export const MIN_TOKEN_SIZE = 24;
export const MAX_TOKEN_SIZE = 120;
/** Extends well beyond the viewport so the grid stays visible while panning/zooming */
export const VIRTUAL_SIZE = 6000;
export const SCALE_BY = 1.12;
export const MIN_SCALE = 0.15;
export const MAX_SCALE = 5;
/** Padding from image edge when constraining token drag (px in world coords) */
export const TOKEN_PADDING = 20;

// ---------------------------------------------------------------------------
// clampStagePos
// ---------------------------------------------------------------------------
/** Clamp stage position so the map edge never goes past the viewport edge.
 *  When the map is larger than the viewport, no blank space is visible.
 *  When the map is smaller, it floats freely within the viewport. */
export function clampStagePos(
  pos: { x: number; y: number },
  scale: number,
  viewport: { width: number; height: number },
  map: { width: number; height: number } | null
): { x: number; y: number } {
  if (!map) return pos;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const mapW = map.width * scale;
  const mapH = map.height * scale;
  return {
    x: clamp(pos.x, Math.min(0, viewport.width  - mapW), Math.max(0, viewport.width  - mapW)),
    y: clamp(pos.y, Math.min(0, viewport.height - mapH), Math.max(0, viewport.height - mapH)),
  };
}
