# Drag Preview & Map Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a token ghost that follows the cursor during drag-to-place, turns red when the drop position is invalid, and enforce that tokens can only be placed on the loaded map image.

**Architecture:** Two tasks, each touching one file. Task 1 adds validity tracking and boundary enforcement to `MapCanvas` (it fires a callback and manages its own cursor state). Task 2 adds `ghostPos`/`isDropValid` state to `SessionView`, renders the ghost via a React portal, and wires the callback.

**Tech Stack:** React `useState`/`useEffect`, `ReactDOM.createPortal`, inline styles (CSS vars + hardcoded colors for semantic states), existing Konva inverse-transform coordinate math.

---

## Files changed

| File | Change |
|---|---|
| `src/components/map/MapCanvas.tsx` | New prop `onDropValidChange`; `isValidHover` state; `handleCanvasPointerMove` + `handleCanvasPointerLeave`; boundary check in `handleCanvasPointerUp`; conditional cursor |
| `src/app/session/[id]/SessionView.tsx` | New `ghostPos` + `isDropValid` state; `onPointerMove` on root div; updated `onPointerUp`; updated `handleTokenDrop`; ghost portal; `onDropValidChange` prop wired to MapCanvas |

---

## Task 1: MapCanvas — validity tracking + boundary enforcement

**Files:**
- Modify: `src/components/map/MapCanvas.tsx`

### Context for implementer

`MapCanvas` already has:
- `imageBounds = mapUrl && imageSize.width > 0 ? { x: 0, y: 0, ...imageSize } : null` (line 53) — null when no map loaded
- `draggingTokenId?: string | null` prop (line 31)
- `handleCanvasPointerUp` (line 113) — needs boundary check added
- Container `<div>` at line 125 with `onPointerUp={handleCanvasPointerUp}`
- `zoom.stageRef.current` for stage access
- `useState` is NOT yet imported (line 3 imports `useRef, useMemo, useEffect`)

---

- [ ] **Step 1: Add `onDropValidChange` to `MapCanvasProps` and destructure it**

In `MapCanvasProps` (around line 32), add after `onTokenDrop`:

```ts
onDropValidChange?: (valid: boolean) => void;
```

In the component function destructuring (around line 43), add:

```ts
draggingTokenId, onTokenDrop, onDropValidChange,
```

- [ ] **Step 2: Add `useState` to the React import and add `isValidHover` state**

Change line 3 from:
```ts
import { useRef, useMemo, useEffect } from "react";
```
to:
```ts
import { useRef, useMemo, useEffect, useState } from "react";
```

Add the state after the existing refs (around line 83, after `panOrigin`):

```ts
const [isValidHover, setIsValidHover] = useState(false);

// Reset cursor state when drag ends
useEffect(() => {
  if (!draggingTokenId) {
    setIsValidHover(false);
  }
}, [draggingTokenId]);
```

- [ ] **Step 3: Add `handleCanvasPointerMove` and `handleCanvasPointerLeave`**

Add these two functions immediately before `handleCanvasPointerUp` (around line 113):

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

const handleCanvasPointerLeave = () => {
  setIsValidHover(false);
  onDropValidChange?.(false);
};
```

- [ ] **Step 4: Add boundary check to `handleCanvasPointerUp`**

Replace the existing `handleCanvasPointerUp` (lines 113–122):

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

- [ ] **Step 5: Update the container div with new handlers and conditional cursor**

Replace the container `<div>` opening tag (line 125):

```tsx
<div
  ref={zoom.containerRef}
  className="w-full h-full bg-black rounded-lg overflow-hidden relative"
  style={draggingTokenId ? { cursor: isValidHover ? 'grabbing' : 'no-drop' } : undefined}
  onPointerUp={handleCanvasPointerUp}
  onPointerMove={handleCanvasPointerMove}
  onPointerLeave={handleCanvasPointerLeave}
>
```

- [ ] **Step 6: Run tests**

```bash
npm test
```

Expected: 29 passed, 0 failed.

- [ ] **Step 7: Check TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no output (clean).

- [ ] **Step 8: Commit**

```bash
git add src/components/map/MapCanvas.tsx
git commit -m "feat: add drag validity tracking and map boundary enforcement to MapCanvas"
```

---

## Task 2: SessionView — ghost state and portal rendering

**Files:**
- Modify: `src/app/session/[id]/SessionView.tsx`

### Context for implementer

`SessionView` currently has (relevant lines):
- Line 4: `import { useEffect, useState, useRef } from "react";` — needs `react-dom` import added separately
- Line 50: `const [draggingTokenId, setDraggingTokenId] = useState<string | null>(null);`
- Line 186–195: `handleTokenDrop` — needs `setGhostPos(null); setIsDropValid(false);` after `setDraggingTokenId(null)`
- Line 297–298: Root return `<div>` with `onPointerUp={() => setDraggingTokenId(null)}`
- Line 305–317: `<MapCanvas ... />` — needs `onDropValidChange={setIsDropValid}` added
- `tokens` is available from the store (line 36)

The ghost must be rendered via `ReactDOM.createPortal` to `document.body` so it sits above all stacking contexts. The component return must be wrapped in a `<>` fragment to accommodate the portal alongside the root div.

---

- [ ] **Step 1: Add `createPortal` import**

Add a new import line after the existing React import (after line 4):

```ts
import { createPortal } from "react-dom";
```

- [ ] **Step 2: Add `ghostPos` and `isDropValid` state**

After line 50 (`draggingTokenId` state), add:

```ts
const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);
const [isDropValid, setIsDropValid] = useState(false);
```

- [ ] **Step 3: Update `handleTokenDrop` to clear ghost state**

In `handleTokenDrop` (line 186), add `setGhostPos(null); setIsDropValid(false);` immediately after `setDraggingTokenId(null)`:

```ts
const handleTokenDrop = async (tokenId: string, x: number, y: number) => {
  const token = tokens.find(t => t.id === tokenId);
  if (!token) return;
  if (!isOwner && token.owner_id !== userId) return;
  setDraggingTokenId(null);
  setGhostPos(null);
  setIsDropValid(false);
  upsertToken({ ...token, placed: true, x, y });
  const supabase = createClient();
  const { error } = await supabase.from('tokens').update({ placed: true, x, y }).eq('id', tokenId);
  if (error) console.error('Failed to place token:', error.message);
};
```

- [ ] **Step 4: Add `onPointerMove` and update `onPointerUp` on the root div**

The root div is currently (line 297–298):

```tsx
<div className="flex flex-col h-screen bg-gray-950 text-white" onPointerUp={() => setDraggingTokenId(null)}>
```

Replace it with:

```tsx
<div
  className="flex flex-col h-screen bg-gray-950 text-white"
  onPointerMove={(e) => { if (draggingTokenId) setGhostPos({ x: e.clientX, y: e.clientY }); }}
  onPointerUp={() => { setDraggingTokenId(null); setGhostPos(null); setIsDropValid(false); }}
>
```

- [ ] **Step 5: Pass `onDropValidChange` to `MapCanvas`**

In the `<MapCanvas ... />` JSX (around line 305), add the new prop:

```tsx
<MapCanvas
  sessionId={sessionId}
  broadcastTokenMove={broadcastTokenMove}
  broadcastTokenDragStart={broadcastTokenDragStart}
  broadcastTokenDragEnd={broadcastTokenDragEnd}
  lockedBy={lockedBy}
  fogTool={fogTool}
  pendingTokenSize={pendingTokenSize}
  tokenSizeScope={tokenSizeScope}
  themeTokens={themeTokens}
  draggingTokenId={draggingTokenId}
  onTokenDrop={handleTokenDrop}
  onDropValidChange={setIsDropValid}
/>
```

- [ ] **Step 6: Wrap the return in a fragment and add the ghost portal**

The current return statement starts with `return (` and contains a single root `<div>`. Wrap in a fragment and append the portal:

```tsx
return (
  <>
    <div
      className="flex flex-col h-screen bg-gray-950 text-white"
      onPointerMove={(e) => { if (draggingTokenId) setGhostPos({ x: e.clientX, y: e.clientY }); }}
      onPointerUp={() => { setDraggingTokenId(null); setGhostPos(null); setIsDropValid(false); }}
    >
      {/* ... all existing children unchanged ... */}
    </div>
    {draggingTokenId && ghostPos && (() => {
      const token = tokens.find(t => t.id === draggingTokenId);
      if (!token) return null;
      return createPortal(
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
              border: isDropValid
                ? '2px solid rgba(255,255,255,0.5)'
                : '2px solid #ef4444',
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
        </div>,
        document.body
      );
    })()}
  </>
);
```

**Note:** The root `<div>` shown above already includes the `onPointerMove` and `onPointerUp` changes from Step 4. If you applied Step 4 as a targeted edit, those attributes are already in place — do not rewrite the root div again. Only add the `<>` fragment wrapper around the existing content and append the portal block after the closing `</div>`. Do NOT change any other existing children.

- [ ] **Step 7: Run tests**

```bash
npm test
```

Expected: 29 passed, 0 failed.

- [ ] **Step 8: Check TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no output (clean).

- [ ] **Step 9: Commit**

```bash
git add "src/app/session/[id]/SessionView.tsx"
git commit -m "feat: add drag ghost portal and validity feedback to SessionView"
```
