# Sidebar Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three sidebar improvements — reskin the "Hide Token" checkbox as an amber pill badge, make the token swatch scale with token size, and allow tokens to be created unplaced and dragged onto the map from the sidebar.

**Architecture:** Features 1 and 2 are self-contained edits to `TokenPanel.tsx`. Feature 3 adds a `placed` boolean column to tokens (migration), changes `addToken()` to create unplaced tokens, lifts drag state into `SessionView`, and adds a drop handler to `MapCanvas`'s container div using the inverse stage transform already used by `useFogPainting`.

**Tech Stack:** React (useState, pointer events), Supabase JS v2, Konva/react-konva, Tailwind/CSS vars.

---

### Task 1: DB migration + Token type

**Files:**
- Create: `supabase/migrations/016_placed.sql`
- Modify: `src/types/index.ts`

- [ ] **Step 1: Create migration**

Create `supabase/migrations/016_placed.sql`:

```sql
alter table tokens add column placed boolean not null default true;
```

`DEFAULT true` means all existing tokens keep rendering on the canvas. New tokens will be inserted with `placed: false` explicitly.

- [ ] **Step 2: Apply migration**

Run against your local Supabase instance:

```bash
supabase db push
```

Or apply manually in the Supabase SQL editor.

- [ ] **Step 3: Add `placed` to Token type**

In `src/types/index.ts`, add `placed: boolean;` to the `Token` interface after `visible`:

```ts
export interface Token {
  id: string;
  session_id: string;
  name: string;
  color: string;
  hp: number;
  max_hp: number;
  x: number;
  y: number;
  image_url: string | null;
  owner_id: string | null;
  size: number | null;
  size_locked: boolean;
  visible: boolean;
  placed: boolean;   // false = unplaced (sidebar only, not rendered on canvas)
}
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: 29 passed (type change has no runtime effect on tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/016_placed.sql src/types/index.ts
git commit -m "feat: add placed column to tokens"
```

---

### Task 2: Feature 1 — Hide Token pill badge

**Files:**
- Modify: `src/components/session/TokenPanel.tsx` (add form section, ~lines 259–276)

Replace the plain `<label><input type="checkbox">` with a styled clickable div that matches the "Hidden" badge style already used in the token list.

- [ ] **Step 1: Replace checkbox with pill button**

Find the existing checkbox block in the add form (the `{isOwner && (<label ...>)}` block containing `<input type="checkbox" ...>`). Replace it entirely with:

```tsx
{isOwner && (
  <button
    type="button"
    onClick={() => setStartHidden(v => !v)}
    className="flex items-center gap-1.5 self-start px-2 py-0.5 rounded text-xs font-medium border transition-colors"
    style={
      startHidden
        ? { background: "rgba(120,53,15,0.4)", borderColor: "rgba(146,64,14,0.5)", color: "#fbbf24" }
        : { background: "transparent", borderColor: "var(--theme-border)", color: "var(--theme-text-muted)" }
    }
  >
    🙈 Hide Token
  </button>
)}
```

The active state (`startHidden: true`) uses the same amber palette as the existing "Hidden" badge (`bg-amber-950/60 border-amber-800/50 text-amber-400`). The inline style values are equivalent: `rgba(120,53,15,0.4)` ≈ `amber-950/40`, `rgba(146,64,14,0.5)` ≈ `amber-800/50`. Use inline styles (not Tailwind classes) per the theme system's convention for dynamic colors.

- [ ] **Step 2: Verify `startHidden` state and payload are unchanged**

Confirm `useState(false)` for `startHidden` is still present (line ~41). Confirm `addToken()` still has `...(isOwner ? { visible: !startHidden } : {})` in the insert payload. These were added in the previous implementation and must not be removed.

- [ ] **Step 3: Manual smoke test**

Start dev server (`npm run dev`). Open the Tokens tab as DM, click "+ Add". Verify:
- "🙈 Hide Token" appears as a muted ghost pill
- Clicking it turns it amber with the same look as the "Hidden" badge on existing hidden tokens
- Clicking again returns it to ghost style
- The token-level behavior is unchanged (hidden tokens still get `visible: false`)

- [ ] **Step 4: Commit**

```bash
git add src/components/session/TokenPanel.tsx
git commit -m "feat: reskin hide token as amber pill badge"
```

---

### Task 3: Feature 2 — Scaled token size preview

**Files:**
- Modify: `src/components/session/TokenPanel.tsx`

The color swatch button in each token row already shows color + optional icon. Make its size scale with the token's effective size.

- [ ] **Step 1: Import `DEFAULT_TOKEN_SIZE`**

In `TokenPanel.tsx`, update the existing `mapUtils` import (line ~13) to include `DEFAULT_TOKEN_SIZE`:

```ts
import { MIN_TOKEN_SIZE, MAX_TOKEN_SIZE, DEFAULT_TOKEN_SIZE } from "@/lib/mapUtils";
```

- [ ] **Step 2: Compute `previewSize` per token**

Inside the `.map((token) => { ... })` block, just after the existing `effectiveSize` calculation (line ~296), add:

```ts
const PREVIEW_MIN = 20;
const PREVIEW_MAX = 48;
const liveSize = pendingSize[token.id] ?? token.size ?? session?.token_size ?? DEFAULT_TOKEN_SIZE;
const previewSize = Math.round(
  PREVIEW_MIN +
  ((liveSize - MIN_TOKEN_SIZE) / (MAX_TOKEN_SIZE - MIN_TOKEN_SIZE)) *
  (PREVIEW_MAX - PREVIEW_MIN)
);
```

`liveSize` uses `pendingSize[token.id]` first so the preview updates live as the slider moves.

- [ ] **Step 3: Apply `previewSize` to the color swatch button**

Find the color swatch button (the `w-6 h-6 rounded-full` button that opens the icon picker). Replace the fixed Tailwind size classes with inline `width`/`height` styles:

```tsx
<button
  type="button"
  onClick={() => controllable && setOpenIconTokenId(openIconTokenId === token.id ? null : token.id)}
  className="rounded-full shrink-0 overflow-hidden border-2 transition-all"
  style={{
    width: previewSize,
    height: previewSize,
    borderColor: token.color,
    background: token.color,
    cursor: controllable ? "pointer" : "default",
  }}
  title={controllable ? "Change icon" : undefined}
>
  {token.image_url && (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={token.image_url} alt="" className="w-full h-full object-cover" />
  )}
</button>
```

Remove the `className` size and hover-border classes (`w-6 h-6`, `hover:border-[var(--theme-border-accent)]`, `cursor-pointer`, `cursor-default`) — they are replaced by the inline style and the conditional cursor.

- [ ] **Step 4: Manual smoke test**

In dev: open the Tokens tab. Verify:
- Tokens with small sizes (slider near min) show a ~20px swatch
- Tokens with large sizes (slider near max) show a ~48px swatch
- Dragging the size slider updates the swatch live
- Icon still displays in the swatch when set
- Clicking swatch still opens the icon picker

- [ ] **Step 5: Commit**

```bash
git add src/components/session/TokenPanel.tsx
git commit -m "feat: scale token swatch preview with token size"
```

---

### Task 4: Unplaced token state — `addToken` + sidebar display

**Files:**
- Modify: `src/components/session/TokenPanel.tsx`

Change `addToken()` to create tokens with `placed: false` (no spawn position). Add an unplaced token row display with a drag handle. Add `onTokenDragStart` prop.

- [ ] **Step 1: Add `onTokenDragStart` to `TokenPanelProps`**

```ts
interface TokenPanelProps {
  sessionId: string;
  isOwner: boolean;
  onCollapse?: () => void;
  onTokenDragStart?: (tokenId: string) => void;
}
```

Destructure it in the component: `const { ..., onTokenDragStart } = { ... }` — add `onTokenDragStart` to the destructuring of props.

- [ ] **Step 2: Change `addToken()` to create unplaced tokens**

Remove the `getSpawnPosition()` call and spawn-position logic from `addToken()`. Change the insert payload to always include `placed: false, x: 0, y: 0`:

```ts
const addToken = async () => {
  if (!name.trim()) return;
  if (atLimit) { setAddError(`Token limit reached (max ${maxTokens}).`); return; }
  setAddError("");
  const supabase = createClient();
  const { data, error } = await supabase
    .from("tokens")
    .insert({
      session_id: sessionId,
      name: name.trim(),
      color,
      hp: maxHp,
      max_hp: maxHp,
      x: 0,
      y: 0,
      placed: false,
      size: session?.token_size ?? DEFAULT_TOKEN_SIZE,
      image_url: iconPath,
      ...(isOwner ? { visible: !startHidden } : {}),
      ...(!isOwner && userId ? { owner_id: userId } : {}),
    })
    .select()
    .single();
  if (error) { setAddError(error.message); return; }
  if (data) upsertToken(data);
  setName("");
  setMaxHp(10);
  setIconPath(null);
  setAdding(false);
};
```

`getSpawnPosition()` is no longer called; leave the function definition in place (don't delete it).

- [ ] **Step 3: Add unplaced token row rendering**

In the token row render block, add a branch at the top that renders an unplaced token row when `!token.placed`:

```tsx
// Unplaced token — drag handle row
if (!token.placed) {
  const canDrag = canControl(token.owner_id);
  return (
    <div
      key={token.id}
      className="rounded-xl p-2.5 border"
      style={{
        background: "var(--theme-bg-surface)",
        borderColor: "var(--theme-border)",
        borderStyle: "dashed",
        opacity: 0.85,
      }}
    >
      <div className="flex items-center gap-2">
        {/* Drag handle */}
        <span
          className="text-lg select-none shrink-0"
          style={{
            color: canDrag ? "var(--theme-text-secondary)" : "var(--theme-text-muted)",
            cursor: canDrag ? "grab" : "default",
          }}
          onPointerDown={(e) => {
            if (!canDrag || !onTokenDragStart) return;
            e.preventDefault();
            onTokenDragStart(token.id);
          }}
          title={canDrag ? "Drag onto the map to place" : undefined}
        >
          ⠿
        </span>
        {/* Color dot */}
        <div className="w-3 h-3 rounded-full shrink-0" style={{ background: token.color }} />
        {/* Name */}
        <span className="text-sm font-medium truncate flex-1" style={{ color: "var(--theme-text-primary)" }}>
          {token.name}
        </span>
        {/* Hint */}
        <span className="text-[10px] shrink-0" style={{ color: "var(--theme-text-muted)" }}>
          drag to map
        </span>
        {/* Delete */}
        {(isOwner || canControl(token.owner_id)) && (
          <button
            onClick={() => removeToken(token.id)}
            className="text-xs transition-colors hover:text-red-400 shrink-0"
            style={{ color: "var(--theme-text-muted)" }}
            title="Remove token"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
```

Place this `if (!token.placed) { return ... }` block at the very top of the `.map((token) => { ... })` callback, before the existing `const hpRatio = ...` line. The `return` short-circuits the normal row.

- [ ] **Step 4: Update button label**

Change the "+ Add" button label from "Add to Map" to "Create Token" since tokens no longer go directly to the map:

```tsx
<button
  onClick={addToken}
  className="w-full py-1.5 text-sm font-bold rounded transition-colors"
  style={{ background: "var(--theme-accent)", color: "var(--theme-text-primary)" }}
>
  Create Token
</button>
```

- [ ] **Step 5: Manual smoke test**

In dev: create a token as DM. Verify it appears in the sidebar with the dashed border and "drag to map" hint, NOT on the canvas. The drag handle `⠿` should show. Delete should work.

- [ ] **Step 6: Commit**

```bash
git add src/components/session/TokenPanel.tsx
git commit -m "feat: create tokens as unplaced, show drag-to-place row in sidebar"
```

---

### Task 5: Drag state in SessionView

**Files:**
- Modify: `src/app/session/[id]/SessionView.tsx`

Wire up `draggingTokenId` state, pass `onTokenDragStart` to `TokenPanel`, pass `draggingTokenId` + `onTokenDrop` to `MapCanvas`, and add a root div fallback to clear drag state when pointer released outside the canvas.

- [ ] **Step 1: Add `draggingTokenId` state**

After the existing `useState` declarations (around line 48), add:

```ts
const [draggingTokenId, setDraggingTokenId] = useState<string | null>(null);
```

- [ ] **Step 2: Add `handleTokenDrop`**

Add this function after `lockAllSizes` (around line 182):

```ts
const handleTokenDrop = async (tokenId: string, x: number, y: number) => {
  const currentTokens = useSessionStore.getState().tokens;
  const token = currentTokens.find(t => t.id === tokenId);
  if (!token) return;
  setDraggingTokenId(null);
  upsertToken({ ...token, placed: true, x, y });
  await createClient().from("tokens").update({ placed: true, x, y }).eq("id", tokenId);
};
```

- [ ] **Step 3: Pass new props to `TokenPanel`**

Find the `<TokenPanel ...>` usage (line ~622). Add `onTokenDragStart`:

```tsx
<TokenPanel
  sessionId={sessionId}
  isOwner={isOwner}
  onTokenDragStart={setDraggingTokenId}
/>
```

- [ ] **Step 4: Pass new props to `MapCanvas`**

Find the `<MapCanvas ...>` usage (lines ~292–302). Add `draggingTokenId` and `onTokenDrop`:

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
/>
```

- [ ] **Step 5: Add root div fallback `onPointerUp`**

The outermost `return` div (line ~285: `<div className="flex flex-col h-screen bg-gray-950 text-white">`) should clear drag state if the pointer is released anywhere outside the canvas. Add:

```tsx
<div
  className="flex flex-col h-screen bg-gray-950 text-white"
  onPointerUp={() => { if (draggingTokenId) setDraggingTokenId(null); }}
>
```

Also apply a cursor style during drag so the user sees "grabbing" everywhere:

```tsx
style={draggingTokenId ? { cursor: "grabbing" } : undefined}
```

Full opening tag:

```tsx
<div
  className="flex flex-col h-screen bg-gray-950 text-white"
  style={draggingTokenId ? { cursor: "grabbing" } : undefined}
  onPointerUp={() => { if (draggingTokenId) setDraggingTokenId(null); }}
>
```

- [ ] **Step 6: Run tests**

```bash
npm test
```

Expected: 29 passed.

- [ ] **Step 7: Commit**

```bash
git add src/app/session/[id]/SessionView.tsx
git commit -m "feat: add drag state and token drop handler to SessionView"
```

---

### Task 6: Canvas — filter unplaced tokens + drop handler

**Files:**
- Modify: `src/components/map/MapCanvas.tsx`

Add `draggingTokenId` + `onTokenDrop` props, filter out `placed: false` tokens from canvas rendering, and add a DOM-level `onPointerUp` handler on the container div to detect drops.

- [ ] **Step 1: Add new props to `MapCanvasProps`**

```ts
interface MapCanvasProps {
  sessionId: string;
  broadcastTokenMove: (id: string, x: number, y: number) => void;
  broadcastTokenDragStart: (token_id: string) => void;
  broadcastTokenDragEnd: (token_id: string) => void;
  lockedBy: Record<string, string>;
  fogTool: "reveal" | "hide" | null;
  pendingTokenSize: number | null;
  tokenSizeScope: "all" | "players";
  themeTokens: ThemeTokens;
  draggingTokenId: string | null;
  onTokenDrop: (tokenId: string, x: number, y: number) => void;
}
```

Add `draggingTokenId` and `onTokenDrop` to the destructured props in the function signature.

- [ ] **Step 2: Filter unplaced tokens**

Find the token filter on line ~179:

```ts
tokens.filter(t => isOwner || (t.visible ?? true)).map((token) => {
```

Change it to filter unplaced tokens first (unconditionally, regardless of `isOwner`):

```ts
tokens
  .filter(t => t.placed !== false)
  .filter(t => isOwner || (t.visible ?? true))
  .map((token) => {
```

- [ ] **Step 3: Add the drop handler function**

Add `handleCanvasPointerUp` inside the component, after the `handleDragEnd` function (~line 93):

```ts
const handleCanvasPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
  if (!draggingTokenId || !zoom.stageRef.current) return;
  const stage = zoom.stageRef.current;
  const container = stage.container().getBoundingClientRect();
  const containerX = e.clientX - container.left;
  const containerY = e.clientY - container.top;
  // Inverse stage transform: container-relative px → world coordinates
  const worldX = (containerX - stage.x()) / stage.scaleX();
  const worldY = (containerY - stage.y()) / stage.scaleY();
  onTokenDrop(draggingTokenId, worldX, worldY);
};
```

- [ ] **Step 4: Add `onPointerUp` to the container div**

Find the outermost `<div ref={zoom.containerRef} ...>` (line ~111). Add the handler:

```tsx
<div
  ref={zoom.containerRef}
  className="w-full h-full bg-black rounded-lg overflow-hidden relative"
  onPointerUp={handleCanvasPointerUp}
>
```

- [ ] **Step 5: Run tests**

```bash
npm test
```

Expected: 29 passed.

- [ ] **Step 6: Manual smoke test**

In dev:
1. Create a token as DM — it should appear in the sidebar with dashed border, NOT on canvas
2. Click and hold the `⠿` drag handle on the unplaced token
3. Drag onto the map and release — token should appear on the canvas at the drop position
4. Verify the token is now in normal row mode (HP controls visible, placed = true)
5. Other clients should see the token appear via realtime
6. Create a token as a player — same flow applies (player drags their own token)
7. Verify releasing outside the canvas clears drag state without placing the token

- [ ] **Step 7: Commit**

```bash
git add src/components/map/MapCanvas.tsx
git commit -m "feat: filter unplaced tokens from canvas, handle sidebar drag-to-place"
```
