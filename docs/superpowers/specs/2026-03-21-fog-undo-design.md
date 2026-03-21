# Fog of War Undo History — Design Spec

**Date:** 2026-03-21
**Status:** Approved

---

## Context

The DM paints fog of war by dragging rectangles on the map. Each drag appends one `FogShape` to `session.fog_shapes`, which is persisted as a JSON column and synced to all clients via `postgres_changes`. There is currently no way to undo a paint operation. This spec adds a server-persisted undo stack with a 50-operation cap, and surfacing the remaining count in the DM sidebar.

---

## Data Model

### New column: `fog_history: FogShape[][]`

Added to the `sessions` table via migration `013_fog_history.sql`:

```sql
alter table sessions
  add column if not exists fog_history jsonb not null default '[]';
```

`fog_history` is a stack of `fog_shapes` snapshots. Each entry is the full `fog_shapes` array as it existed *before* the corresponding paint operation. The stack is capped at 50 entries. The oldest entry is dropped when the cap is exceeded.

**`Session` type** (`src/types/index.ts`): add `fog_history: FogShape[][]`.

---

## Commit Flow (paint a shape)

Both `commitFogShape` and `undoFog` live in `useFogPainting.ts` — the hook that already owns all fog mutation logic. `SessionView.tsx` receives `undoFog` from the hook's return value and calls it from the sidebar button, exactly as it already calls `stageMouseDown` etc. This keeps all history read/write logic co-located.

In `useFogPainting.ts`, `commitFogShape(shape)`:

1. Read current `fog_shapes` and `fog_history` from store.
2. Push current `fog_shapes` onto `fog_history`. If `fog_history.length >= 50`, drop the oldest entry (index 0) before pushing. **Note: this cap is enforced optimistically in client code only — there is no DB or RLS enforcement. A second DM browser tab that hasn't yet received the realtime update could exceed 50 entries transiently; the drop-oldest logic handles this gracefully without data loss.**
3. Append `shape` to `fog_shapes`.
4. Optimistic store update: `setSession({ ...s, fog_shapes, fog_history })`.
5. Single DB write: `supabase.from("sessions").update({ fog_shapes, fog_history }).eq("id", s.id)`.

---

## Undo Flow

New `undoFog()` function returned from `useFogPainting.ts` (alongside `stageMouseDown` etc.), called by `SessionView.tsx`:

1. Read current `fog_shapes` and `fog_history` from store.
2. If `fog_history` is empty, return early (button is disabled in UI anyway).
3. Pop the last entry from `fog_history` → `previousShapes`.
4. Optimistic store update: `setSession({ ...s, fog_shapes: previousShapes, fog_history })`.
5. Single DB write: `supabase.from("sessions").update({ fog_shapes: previousShapes, fog_history }).eq("id", s.id)`.

All connected clients receive the rollback immediately via the existing `postgres_changes → setSession` realtime path.

---

## Clear Fog

The existing `clearFog()` in `SessionView.tsx` is updated to also clear history:

```ts
setSession({ ...current, fog_shapes: [], fog_history: [] });
await supabase.from("sessions").update({ fog_shapes: [], fog_history: [] }).eq("id", s.id);
```

## Toggle Fog

`toggleFog()` in `SessionView.tsx` toggles `fog_enabled` (a boolean) but does **not** mutate `fog_shapes` or `fog_history`. No change needed — turning fog on/off is not a paintable action and does not affect the undo stack.

---

## DM Sidebar UI

Changes within the existing **Fog of War** card in `SessionView.tsx`:

- **Operation counter**: `"X / 50 fog operations"` rendered below the tool buttons. `X = fog_history.length` — the number of operations currently available to undo.
- **At-limit state** (X = 50): disable both Reveal and Hide tool buttons; show inline notice: `"Limit reached — undo or reset to continue."` Fog tool is forced to `null`.
- **Undo last button**: enabled when `fog_history.length > 0`. Calls `undoFog()`.
- **Reset all fog zones**: already exists; now also clears `fog_history`.

---

## Realtime

No new realtime infrastructure required. `fog_history` is a column on `sessions`. The existing `postgres_changes UPDATE` handler in `useRealtimeSession.ts` calls `setSession(session)`, which propagates `fog_history` (and the rolled-back `fog_shapes`) to all clients automatically.

---

## Files Changed

| File | Change |
|---|---|
| `supabase/migrations/013_fog_history.sql` | Add `fog_history jsonb not null default '[]'` — migrations 011 (grid_enabled) and 012 (size_locked) already exist |
| `src/types/index.ts` | Add `fog_history: FogShape[][]` to `Session` |
| `src/lib/useFogPainting.ts` | `commitFogShape` pushes snapshot, caps at 50, writes both columns |
| `src/app/session/[id]/SessionView.tsx` | Receives `undoFog` from hook; counter, at-limit guard, Undo button in fog card |

No changes to `FogLayer.tsx`, `MapCanvas.tsx`, `useRealtimeSession.ts`, or `TokenPanel.tsx`.

---

## Constraints

- Stack cap: 50. The oldest snapshot is silently dropped when the cap is reached. The counter always reflects the accurate remaining undo count.
- Redo: not supported. Undo is destructive — once undone, the shape cannot be restored without re-painting.
- DM-only: undo button is in the DM tab, which is only rendered for `isOwner`. Players have no undo surface.
- RLS: the existing `UPDATE session` policy already restricts session writes to the session owner. The new `fog_history` column is covered by this same policy — no new RLS work is required.
