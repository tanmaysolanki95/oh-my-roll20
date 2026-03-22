# Drag Preview & Map Boundary Design

**Date:** 2026-03-22
**Status:** Approved

## Overview

Two improvements to the drag-to-place token flow:

1. **Drag ghost** — a visual indicator follows the cursor during drag, showing the token being placed
2. **Map boundary enforcement** — drops outside the map image (or when no map is loaded) are rejected with visual feedback

---

## Feature 1: Drag Ghost

### What it is

A fixed-position HTML `<div>` rendered in `SessionView` that follows the cursor whenever `draggingTokenId` is non-null. It shows the token's color circle and name. It is visible from the moment the drag begins (in the sidebar) through to the drop on the canvas.

### State

Add to `SessionView`:

```ts
const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);
const [isDropValid, setIsDropValid] = useState(false);
```

- `ghostPos` is set from `onPointerMove` on the root div (only when `draggingTokenId` is set).
- `isDropValid` is driven by `onDropValidChange` callback from `MapCanvas` (see Feature 2).

### Tracking cursor position

Add `onPointerMove` to `SessionView`'s root div:

```tsx
onPointerMove={(e) => {
  if (draggingTokenId) setGhostPos({ x: e.clientX, y: e.clientY });
}}
```

Clear `ghostPos` in the existing `onPointerUp` fallback:

```tsx
onPointerUp={() => { setDraggingTokenId(null); setGhostPos(null); setIsDropValid(false); }}
```

Also clear in `handleTokenDrop` after a successful drop:

```ts
setGhostPos(null);
setIsDropValid(false);
```

### Ghost rendering

Rendered in `SessionView`'s JSX, outside the main layout flow (at the end of the return, after the root div closes — or as a React portal to `document.body`). Use an inline fixed `<div>`:

```tsx
{draggingTokenId && ghostPos && (() => {
  const token = tokens.find(t => t.id === draggingTokenId);
  if (!token) return null;
  return (
    <div
      style={{
        position: 'fixed',
        left: ghostPos.x,
        top: ghostPos.y,
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        zIndex: 9999,
        opacity: isDropValid ? 0.85 : 0.45,
        transition: 'opacity 0.1s',
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: token.color,
          border: isDropValid ? '2px solid rgba(255,255,255,0.5)' : '2px solid #ef4444',
          boxShadow: isDropValid ? undefined : '0 0 0 2px rgba(239,68,68,0.3)',
        }}
      />
      <div
        style={{
          marginTop: 4,
          textAlign: 'center',
          fontSize: 11,
          fontWeight: 600,
          color: isDropValid ? 'rgba(255,255,255,0.85)' : '#ef4444',
          textShadow: '0 1px 2px rgba(0,0,0,0.8)',
          whiteSpace: 'nowrap',
        }}
      >
        {token.name}
      </div>
    </div>
  );
})()}
```

### Visual states

| State | Opacity | Circle border | Name color |
|---|---|---|---|
| Valid drop zone | 0.85 | `rgba(255,255,255,0.5)` | `rgba(255,255,255,0.85)` |
| Invalid drop zone | 0.45 | `#ef4444` (red) | `#ef4444` |

---

## Feature 2: Map Boundary Enforcement

### Validity callback

Add a new optional prop to `MapCanvasProps`:

```ts
onDropValidChange?: (valid: boolean) => void;
```

Pass it from `SessionView`:

```tsx
onDropValidChange={setIsDropValid}
```

### MapCanvas: local hover state + cursor

Add local state in `MapCanvas`:

```ts
const [isValidHover, setIsValidHover] = useState(false);
```

Apply conditional cursor to the container div:

```tsx
style={{
  cursor: draggingTokenId
    ? (isValidHover ? 'grabbing' : 'no-drop')
    : undefined,
}}
```

### MapCanvas: onPointerMove validity check

Add `onPointerMove` to the container div:

```ts
const handleCanvasPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
  if (!draggingTokenId || !zoom.stageRef.current) return;
  const stage = zoom.stageRef.current;
  const container = stage.container().getBoundingClientRect();
  const containerX = e.clientX - container.left;
  const containerY = e.clientY - container.top;
  const worldX = (containerX - stage.x()) / stage.scaleX();
  const worldY = (containerY - stage.y()) / stage.scaleY();
  const valid = !!imageBounds &&
    worldX >= imageBounds.x &&
    worldY >= imageBounds.y &&
    worldX <= imageBounds.x + imageBounds.width &&
    worldY <= imageBounds.y + imageBounds.height;
  setIsValidHover(valid);
  onDropValidChange?.(valid);
};
```

### MapCanvas: onPointerLeave

Add `onPointerLeave` to the container div:

```ts
const handleCanvasPointerLeave = () => {
  setIsValidHover(false);
  onDropValidChange?.(false);
};
```

### MapCanvas: drop enforcement in handleCanvasPointerUp

The existing `handleCanvasPointerUp` recomputes validity and returns early if the drop is invalid:

```ts
const handleCanvasPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
  if (!draggingTokenId || !onTokenDrop || !zoom.stageRef.current) return;
  const stage = zoom.stageRef.current;
  const container = stage.container().getBoundingClientRect();
  const containerX = e.clientX - container.left;
  const containerY = e.clientY - container.top;
  const worldX = (containerX - stage.x()) / stage.scaleX();
  const worldY = (containerY - stage.y()) / stage.scaleY();
  if (
    !imageBounds ||
    worldX < imageBounds.x ||
    worldY < imageBounds.y ||
    worldX > imageBounds.x + imageBounds.width ||
    worldY > imageBounds.y + imageBounds.height
  ) return;
  onTokenDrop(draggingTokenId, worldX, worldY);
};
```

`imageBounds` is already available in `MapCanvas` as a local variable:
```ts
const imageBounds = mapUrl && imageSize.width > 0 ? { x: 0, y: 0, ...imageSize } : null;
```

### No-map case

When no map is loaded, `imageBounds` is `null`. `handleCanvasPointerMove` evaluates `valid = false` and fires `onDropValidChange(false)`, so the ghost immediately shows the invalid (red) state when hovering over the canvas. `handleCanvasPointerUp` returns early. The entire canvas shows `cursor: no-drop`.

---

## Files changed

| File | Change |
|---|---|
| `src/app/session/[id]/SessionView.tsx` | Add `ghostPos` + `isDropValid` state; root `onPointerMove` + updated `onPointerUp`; ghost `<div>` rendering; update `handleTokenDrop` cleanup; pass `onDropValidChange` to `MapCanvas` |
| `src/components/map/MapCanvas.tsx` | Add `onDropValidChange` prop; add `isValidHover` state; add `onPointerMove` + `onPointerLeave` on container div; add boundary check in `handleCanvasPointerUp`; conditional cursor on container div |

---

## Pitfalls

- **Ghost must be `pointer-events: none`** — otherwise the ghost div intercepts pointer events and breaks the drop detection on the canvas container.
- **`isValidHover` must reset on drag end** — when `draggingTokenId` becomes null, `isValidHover` should revert to `false` so the cursor style is removed. Use a `useEffect` in MapCanvas: `useEffect(() => { if (!draggingTokenId) setIsValidHover(false); }, [draggingTokenId])`.
- **`imageBounds` coordinate system** — `imageBounds.x` and `imageBounds.y` are always `0` (the map image is always placed at the world origin). The check is simply `worldX >= 0 && worldY >= 0 && worldX <= width && worldY <= height`.
- **Do not use `zoom.imageBoundsRef`** — the `imageBounds` local variable is computed fresh on every render from `mapUrl` and `imageSize`; use it directly, not the ref. The ref exists for stale-closure safety in long-lived event handlers, but `handleCanvasPointerMove` and `handleCanvasPointerUp` are inline `const`s that close over the current render's values.
