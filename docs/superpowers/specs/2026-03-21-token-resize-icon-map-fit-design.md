---
title: Token resize propagation, icon-resize regression, and map auto-fit
date: 2026-03-21
status: approved
---

## Problem summary

Three related bugs/gaps:

1. **Token resize not propagating** — Per-token size changes made via the size slider in TokenPanel are visible to the slider's owner but never reach other clients.
2. **Icon selection causes apparent resize** — After a player resizes their token and then picks an icon, the token snaps back to its old size.
3. **No auto-fit on map upload** — When the DM uploads a map, all clients (DM and players) stay at whatever zoom/pan they were at; the new map is not automatically shown.

## Root causes

### Issues 1 & 2 — missing `await` in `TokenPanel.tsx`

`onPointerUp` on the per-token size slider:

```ts
const supabase = createClient();
supabase.from("tokens").update({ size: val }).eq("id", token.id);
```

Supabase JS v2 executes queries lazily — the HTTP request only fires when the `PromiseLike` is awaited or `.then()`-chained. Without `await`, the DB is never written, so no `postgres_changes` event fires and other clients never see the change.

The local store is updated optimistically (`upsertToken({ ...token, size: val })`), so the slider owner sees the change — but only in memory. Later, when the same player sets an icon, `updateIcon` correctly `await`s its DB write; the `postgres_changes` echo returns the full token row, which carries the **old** DB size, overwriting the local optimistic value and causing the visible "resize".

### Issue 3 — no view-reset hook in `MapCanvas`

`useMapZoom` exposes `resetView()` but nothing calls it when `session.map_url` changes. Clients stay at their current zoom/pan after a new map loads.

## Design

### Fix 1 & 2 — `src/components/session/TokenPanel.tsx`

Make `onPointerUp` async and add `await`. React does not use the return value of event handlers, so `async` here is safe:

```ts
onPointerUp={async (e) => {
  if (token.size_locked) return;
  const val = Number((e.target as HTMLInputElement).value);
  setPendingSize((prev) => { const next = { ...prev }; delete next[token.id]; return next; });
  const supabase = createClient();
  await supabase.from("tokens").update({ size: val }).eq("id", token.id);
}}
```

### Fix 3 — `src/components/map/MapCanvas.tsx`

`mapUrl` is already read from `useSessionStore()` inside `MapCanvas` (not a prop). Add a `useEffect` below the existing `useImageSize` / `useMapZoom` setup that uses both:

```ts
const lastResetMapUrlRef = useRef<string | null>(null);
useEffect(() => {
  if (imageBounds && mapUrl && mapUrl !== lastResetMapUrlRef.current) {
    zoom.resetView();
    lastResetMapUrlRef.current = mapUrl;
  }
}, [imageBounds, mapUrl, zoom.resetView]);
```

`zoom.resetView` is included in the dependency array (it is a `useCallback` from `useMapZoom`; it only changes when `imageBounds` changes, so it causes no extra triggers beyond what `imageBounds` already causes).

**Behavior:**
- Fires on all clients because `session.map_url` propagates via `postgres_changes` → `setSession()`.
- `imageBounds` is null until `useImageSize(mapUrl)` resolves, so the reset only fires once image dimensions are known.
- `lastResetMapUrlRef` prevents re-triggering on unrelated re-renders.
- Works for initial join (existing map), first upload, and map replacement.

## Files changed

| File | Change |
|---|---|
| `src/components/session/TokenPanel.tsx` | Add `async` + `await` to `onPointerUp` size handler |
| `src/components/map/MapCanvas.tsx` | Add auto-fit `useEffect` triggered by `mapUrl` + `imageBounds` |

## Out of scope

- DM tab auto-switch on map upload (explicitly excluded by user)
- Batch resize (DM slider in SessionView) — already correctly `await`s via `commitTokenSize`
