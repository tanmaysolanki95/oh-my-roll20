# Sidebar Improvements Design

**Date:** 2026-03-22
**Status:** Approved

## Overview

Three improvements to the token sidebar panel:

1. **Hide Token pill badge** — reskin the DM's "Hide Token" checkbox as an amber pill matching the existing "Hidden" badge style
2. **Token size preview** — the color/icon swatch in each token row scales proportionally with the token's effective size
3. **Drag to place** — tokens are created unplaced; DM and players drag them from the sidebar onto the canvas to position them

---

## Feature 1: Hide Token Pill Badge

### What changes

Replace the `<input type="checkbox">` + `<label>` in the add token form with a styled clickable `<div>`.

### Visual states

- **Off (not hidden):** ghost style — `border border-[var(--theme-border)] text-[var(--theme-text-muted)]`, transparent background
- **On (will be hidden):** `bg-amber-950/60 border border-amber-800/50 text-amber-400` — identical to the "Hidden" badge already rendered on token rows (line ~358 of `TokenPanel.tsx`)

### Behavior

- `onClick` toggles `startHidden` (no change from current behavior)
- Still gated behind `{isOwner && ...}`
- `startHidden` still persists across form opens (not reset on add)

### Files

- Modify: `src/components/session/TokenPanel.tsx` (add form section only)

---

## Feature 2: Token Size Preview

### What changes

The existing `w-6 h-6` (24px) color swatch button in each token row scales dynamically based on the token's effective size.

### Scaling formula

```ts
const PREVIEW_MIN = 20; // px
const PREVIEW_MAX = 48; // px
const previewSize = Math.round(
  PREVIEW_MIN +
  ((effectiveSize - MIN_TOKEN_SIZE) / (MAX_TOKEN_SIZE - MIN_TOKEN_SIZE)) *
  (PREVIEW_MAX - PREVIEW_MIN)
);
```

- `effectiveSize` = `pendingSize[token.id] ?? token.size ?? session?.token_size ?? DEFAULT_TOKEN_SIZE` (import `DEFAULT_TOKEN_SIZE` from `@/lib/mapUtils` alongside the existing `MIN_TOKEN_SIZE` / `MAX_TOKEN_SIZE` imports)
- Updates live as the slider moves (because `pendingSize` already drives re-renders)
- Clamped to `PREVIEW_MIN`–`PREVIEW_MAX` so it doesn't overflow the row

### Layout

The swatch is already inside a `flex-wrap` row. The dynamic size replaces the fixed `w-6 h-6` Tailwind classes with inline `width`/`height` styles. The icon picker trigger remains on the same element.

### Files

- Modify: `src/components/session/TokenPanel.tsx` (token row swatch only)

---

## Feature 3: Drag to Place

### Schema

New migration: `supabase/migrations/016_placed.sql`

```sql
alter table tokens add column placed boolean not null default true;
```

`DEFAULT true` ensures all existing tokens remain visible. New tokens from the add form are inserted with `placed: false`.

### Token type

Add to `Token` in `src/types/index.ts`:

```ts
placed: boolean; // false = unplaced (sidebar only, not on canvas)
```

### Creation flow change

`addToken()` in `TokenPanel` no longer computes a spawn position. Insert payload sets `placed: false` and omits `x`/`y` (or uses 0). The `getSpawnPosition()` helper is no longer called from `addToken()`.

### Canvas rendering

Unplaced tokens are filtered out **unconditionally** — before the existing `isOwner || visible` check — so neither DMs nor players ever see an unplaced token on the canvas:

```ts
tokens
  .filter(t => t.placed !== false)          // never render unplaced tokens on canvas
  .filter(t => isOwner || (t.visible ?? true)) // existing visibility rule
```

### Sidebar: unplaced token display

Unplaced tokens render differently in the token list:

- A drag handle `⠿` on the left side
- "Drag to map to place" hint text (muted, small)
- No HP controls, no size slider — token is not in play yet
- Styled with a dashed border and muted background (similar to hidden tokens)
- Once `placed: true`, the full token row renders normally

### Drag state

`SessionView` owns:

```ts
const [draggingTokenId, setDraggingTokenId] = useState<string | null>(null);
```

Passed as a prop to `MapCanvas`.

### Drag initiation (TokenPanel)

`TokenPanel` receives a new `onTokenDragStart(tokenId: string)` prop from `SessionView`.

On the unplaced token row:
- `onPointerDown` on the drag handle calls `onTokenDragStart(token.id)`
- A CSS `cursor: grabbing` is applied during drag via the `draggingTokenId` state in `SessionView`

### Drop detection (MapCanvas)

`MapCanvas` receives:
- `draggingTokenId: string | null`
- `onTokenDrop: (tokenId: string, x: number, y: number) => void`

When `draggingTokenId` is set, a DOM-level `onPointerUp` is added to the **canvas container `<div>`** (not a Konva Stage synthetic event) in `MapCanvas`. The drag starts in the HTML sidebar, so the `pointerup` fires on the DOM, not within the Konva context. The handler converts container-relative coordinates to world (stage) coordinates using the inverse stage transform:

```ts
const handleCanvasPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
  if (!draggingTokenId || !zoom.stageRef.current) return;
  const stage = zoom.stageRef.current;
  const container = stage.container().getBoundingClientRect();
  const containerX = e.clientX - container.left;
  const containerY = e.clientY - container.top;
  // Apply inverse stage transform to get world coordinates
  const worldX = (containerX - stage.x()) / stage.scaleX();
  const worldY = (containerY - stage.y()) / stage.scaleY();
  onTokenDrop(draggingTokenId, worldX, worldY);
};
```

This matches the same coordinate math used in `useFogPainting`. In `MapCanvas`, the stage ref lives at `zoom.stageRef` (returned from `useMapZoom`) — never reference a bare `stageRef`. `stage.x()`, `stage.y()`, `stage.scaleX()`, `stage.scaleY()` reflect the current pan/zoom state.

### Drop handler (SessionView)

```ts
const handleTokenDrop = async (tokenId: string, x: number, y: number) => {
  const token = tokens.find(t => t.id === tokenId);
  if (!token) return;
  setDraggingTokenId(null);
  upsertToken({ ...token, placed: true, x, y });
  await supabase.from('tokens').update({ placed: true, x, y }).eq('id', tokenId);
};
```

Follows the standard optimistic-update-then-persist pattern.

### Who can drag

Token owner OR session owner — mirrors existing update RLS (`canControl` logic already in `TokenPanel`).

### Realtime propagation

`placed`, `x`, `y` all propagate to other clients via the existing `postgres_changes` tokens UPDATE handler → `upsertToken()`. No extra subscription needed.

---

## Files changed

| File | Change |
|---|---|
| `supabase/migrations/016_placed.sql` | New: `placed` column |
| `src/types/index.ts` | Add `placed: boolean` to `Token` |
| `src/components/session/TokenPanel.tsx` | All three features; receives `onTokenDragStart` prop |
| `src/app/session/[id]/SessionView.tsx` | `draggingTokenId` state, `handleTokenDrop`, pass props to `MapCanvas` and `TokenPanel`; add `onPointerUp` on root div to clear `draggingTokenId` when pointer released outside canvas |
| `src/components/map/MapCanvas.tsx` | Skip unplaced tokens; add `onPointerUp` to canvas container div for drop; add `draggingTokenId` + `onTokenDrop` props |

---

## Pitfalls

- **Coordinate math for drop** — `stage.getPointerPosition()` returns container-relative px, NOT world coordinates. Always apply the inverse stage transform: `worldX = (containerX - stage.x()) / stage.scaleX()`. The drop handler in `MapCanvas` must do this math; never pass raw `event.clientX/Y` or assume `getPointerPosition()` is already world-space. See `useFogPainting` for the same pattern.
- **`placed` default** — migration default is `true` so existing tokens are unaffected. New tokens set `placed: false` explicitly in the insert.
- **No spawn position needed** — `getSpawnPosition()` is no longer called on add. Remove or leave unused; do not delete if it might be needed for a future "place at default" feature.
- **Unplaced tokens invisible to players** — unplaced tokens with `placed: false` should never be sent to players in the realtime stream. However, since RLS on SELECT is not currently filtering by `placed`, unplaced tokens will be visible in the sidebar to players who own them — this is correct and expected (they need to see them to drag them). Hidden + unplaced = visible to DM only (existing `visible` RLS behavior is unchanged).
- **`draggingTokenId` must be cleared on pointerup everywhere** — if the user releases the pointer outside the canvas, `draggingTokenId` must still be cleared. Add a `onPointerUp` handler on `SessionView`'s root div as a fallback.
