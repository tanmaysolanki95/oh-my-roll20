# Token Resize Propagation, Icon-Resize Regression, Map Auto-Fit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix per-token size changes not propagating to other clients, fix icon selection reverting a token's size, and auto-fit the map view for all clients when a new map is uploaded.

**Architecture:** Two surgical edits — one `await` keyword added to the per-token size DB write in `TokenPanel.tsx` (fixing both the propagation bug and the icon-resize regression at the root), and one `useEffect` added to `MapCanvas.tsx` that calls `zoom.resetView()` whenever `mapUrl` changes and its image bounds are ready.

**Tech Stack:** Next.js 14 (App Router), React, Supabase JS v2, Konva/react-konva, Zustand, TypeScript

---

## File Map

| File | Change |
|---|---|
| `src/components/session/TokenPanel.tsx` | Make `onPointerUp` size handler async; add `await` to `supabase.from("tokens").update(...)` |
| `src/components/map/MapCanvas.tsx` | Add `useRef` + `useEffect` for auto-fit on `mapUrl` / `imageBounds` change |

---

## Task 1: Fix per-token size not persisting to DB

**Files:**
- Modify: `src/components/session/TokenPanel.tsx` (around line 433–439 — the `onPointerUp` handler on the size range input)

**Background:** In Supabase JS v2, `.from(...).update(...)...` is a lazy `PromiseLike`. The HTTP request only fires when you `await` or `.then()` it. The current `onPointerUp` calls it without `await`, so the DB is never written, no `postgres_changes` event fires, and other clients never see the size change. React does not use the return value of event handlers, so making the handler `async` is safe.

- [ ] **Step 1: Open the file and locate the handler**

  Open `src/components/session/TokenPanel.tsx`. Find the `<input type="range" ...>` for the token size slider (around line 421). The `onPointerUp` handler currently looks like:

  ```tsx
  onPointerUp={(e) => {
    if (token.size_locked) return;
    const val = Number((e.target as HTMLInputElement).value);
    setPendingSize((prev) => { const next = { ...prev }; delete next[token.id]; return next; });
    const supabase = createClient();
    supabase.from("tokens").update({ size: val }).eq("id", token.id);
  }}
  ```

- [ ] **Step 2: Add `async` and `await`**

  Replace the handler with:

  ```tsx
  onPointerUp={async (e) => {
    if (token.size_locked) return;
    const val = Number((e.target as HTMLInputElement).value);
    setPendingSize((prev) => { const next = { ...prev }; delete next[token.id]; return next; });
    const supabase = createClient();
    await supabase.from("tokens").update({ size: val }).eq("id", token.id);
  }}
  ```

  That is the entire change — one `async` keyword and one `await`.

- [ ] **Step 3: Verify no TypeScript errors**

  ```bash
  cd /Users/tanmay/oh-my-roll20 && npx tsc --noEmit
  ```

  Expected: no errors related to this handler. (Any pre-existing errors are irrelevant.)

- [ ] **Step 4: Manual smoke test**

  Open two browser tabs to the same session. In one tab, move the size slider for a token you own. Release. Confirm the token resizes in **both** tabs.

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/session/TokenPanel.tsx
  git commit -m "fix: await token size update so it persists to DB and propagates to other clients"
  ```

---

## Task 2: Verify icon selection no longer reverts token size

**Files:**
- No code changes — this regression is fixed as a side effect of Task 1.

**Background:** The apparent resize on icon selection happened because `updateIcon` correctly `await`s its `image_url` DB write. The `postgres_changes` echo from that write returns the full token row — which contained the **old** size (since the size write in Task 1 was never persisted). After Task 1, the DB has the correct size, so the echo returns the correct size and no visual regression occurs.

- [ ] **Step 1: Manual smoke test**

  Open two browser tabs to the same session. In one tab:
  1. Move the size slider for a token you own. Release (size should now be persisted per Task 1).
  2. Open the icon picker for that token. Select any icon.
  3. Confirm the token does **not** snap to a different size in either tab.

- [ ] **Step 2: Confirm no additional code changes needed**

  This task has no commit. If the smoke test passes, proceed to Task 3.

---

## Task 3: Auto-fit map view for all clients when map URL changes

**Files:**
- Modify: `src/components/map/MapCanvas.tsx` (add `useRef` import guard and `useEffect` after the existing `useImageSize` / `useMapZoom` setup, around line 47–57)

**Background:** `useMapZoom` exposes `resetView()`, which scales and pans the stage to fit the map in the viewport. Currently nothing calls it automatically. `mapUrl` is already read from `useSessionStore()` inside `MapCanvas` (it is not a prop). `imageBounds` is null until `useImageSize(mapUrl)` resolves — using it as a guard ensures we only reset once the image dimensions are known. `lastResetMapUrlRef` ensures we only reset once per URL, not on every re-render.

All clients see the same effect: the DM's store updates immediately after upload; players receive the `postgres_changes` session UPDATE which calls `setSession()`, updating their `mapUrl`, which triggers `useImageSize` and eventually this effect.

- [ ] **Step 1: Locate the setup area in MapCanvas**

  Open `src/components/map/MapCanvas.tsx`. Find the block near the top of the component body (around lines 46–57):

  ```tsx
  const mapUrl = session?.map_url ?? null;
  const imageSize = useImageSize(mapUrl);
  const imageBounds = mapUrl && imageSize.width > 0 ? { x: 0, y: 0, ...imageSize } : null;

  const zoom = useMapZoom(imageBounds);
  const fog = useFogPainting({ ... });
  ```

- [ ] **Step 2: Add the auto-fit effect**

  Immediately after the `const fog = useFogPainting(...)` block, add:

  ```tsx
  // Auto-fit the view whenever a new map URL loads (fires for DM and all players).
  const lastResetMapUrlRef = useRef<string | null>(null);
  useEffect(() => {
    if (imageBounds && mapUrl && mapUrl !== lastResetMapUrlRef.current) {
      zoom.resetView();
      lastResetMapUrlRef.current = mapUrl;
    }
  }, [imageBounds, mapUrl, zoom.resetView]);
  ```

  `useRef` is already imported at the top of the file (`import { useRef, useMemo } from "react"`). Add `useEffect` to that same import:

  ```tsx
  import { useRef, useMemo, useEffect } from "react";
  ```

- [ ] **Step 3: Verify no TypeScript errors**

  ```bash
  cd /Users/tanmay/oh-my-roll20 && npx tsc --noEmit
  ```

  Expected: no new errors.

- [ ] **Step 4: Manual smoke test**

  Open two browser tabs to the same session (one as DM, one as player).
  1. In the DM tab, upload a map image via the DM tab → Battle Map section.
  2. Confirm both tabs automatically zoom/pan to fit the new map in the viewport.
  3. Pan/zoom the map in one tab, then upload a replacement map. Confirm both tabs auto-fit again.
  4. Open a new browser tab and join the session that already has a map. Confirm the view auto-fits on load.

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/map/MapCanvas.tsx
  git commit -m "feat: auto-fit map view for all clients when map URL changes"
  ```

---

## Task 4: Push

- [ ] **Step 1: Push to remote**

  ```bash
  git push
  ```
