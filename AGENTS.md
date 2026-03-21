<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Codebase guide for AI agents

## What this project is

A real-time virtual tabletop (VTT) for D&D. Key concepts:

- **Session** — a game room with a map, tokens, and dice log. One user is the DM (owner).
- **Token** — a circular canvas shape representing a character. Has HP, color, position, visibility, optional size override, and an optional portrait icon.
- **Fog of war** — DM paints rectangular zones over the map to hide/reveal areas from players.
- **Join code** — 6-character uppercase string (e.g. `A3F2B9`) stored on the session row. Players join via this code; the app looks up the session ID from it.

---

## Architecture decisions you must understand before editing

### State management

All client state lives in the Zustand store (`src/store/session.ts`). The pattern throughout is:

1. **Optimistic update** — call the store setter immediately so UI is responsive
2. **Persist** — `await supabase.from(...).update(...)` to write to DB
3. **Other clients** — receive the change via `postgres_changes` subscription in `useRealtimeSession.ts` and call the same store setter

Never write to the DB without first updating the store. Never update only the store without persisting (except for ephemeral drag positions).

### Realtime: two channels, different purposes

```
Broadcast  →  token drag positions (throttled ~20fps), token_drag_start/end (lock), session_ended
postgres_changes  →  everything else (HP, position commit, fog, token visibility, session settings)
```

Broadcast events are ephemeral — they fire and forget, no DB write. They're used for live feedback that would be too noisy to persist per-update.

**Critical:** Supabase uses `REPLICA IDENTITY DEFAULT` on all tables, which means DELETE events only send the primary key in `old`. Never check `old.session_id` or `old.anything_except_pk` in a DELETE handler — it will always be undefined.

```ts
// CORRECT
.on("postgres_changes", { event: "DELETE", schema: "public", table: "tokens" },
  ({ old: token }) => { removeToken((token as Token).id); }
)

// BROKEN — session_id is always undefined on DELETE
.on("postgres_changes", ..., ({ old }) => {
  if (old.session_id !== sessionId) return; // this always fires, removeToken never runs
})
```

### Stale closure pattern in MapCanvas

MapCanvas has long-lived event handlers (mouse down/move/up, wheel) that are registered once. To avoid stale closure bugs, all frequently-changing values are mirrored in refs:

```ts
const stageScaleRef = useRef(stageScale);
useEffect(() => { stageScaleRef.current = stageScale; }, [stageScale]);
```

Always read `.current` inside event handlers, never the state variable directly. Add a new ref + sync effect whenever you add state that event handlers need to read.

### Fog history and undo

`fog_history: FogShape[][]` on `Session` is an append-only array of snapshots. Each entry is the **previous** `fog_shapes` state saved before a fog paint operation was committed. The flow:

1. Before committing a new fog shape, push `current.fog_shapes` onto `fog_history`
2. Write both `fog_shapes` (new state) and `fog_history` (updated list) to DB in one update
3. Undo: pop the last entry, restore it as `fog_shapes`, write both back

**50-operation cap** — `fog_history` is capped at 50 entries. When the cap is reached, `SessionView` sets `fogAtLimit = true`, which disables the Reveal/Hide buttons and forces `fogTool` to `null`. The cap is enforced at commit time by slicing `history.slice(0, 49)` before appending. `fog_history` propagates to all clients via the existing `postgres_changes` sessions UPDATE handler — no extra subscription needed.

### Fog of war controls (lifted state)

Fog tool selection (`fogTool: "reveal" | "hide" | null`) is owned by `SessionView` and passed as a controlled prop to `useFogPainting` (via `MapCanvas`). This allows the DM tab UI in the sidebar to control fog mode while the canvas still handles mouse events. The same lift pattern applies to `pendingTokenSize` and `tokenSizeScope` for the token size slider.

```
SessionView (owns fogTool state)
  └─ MapCanvas (receives fogTool prop)
       └─ useFogPainting (receives fogTool prop, syncs to ref for stale-closure safety)
```

### Fog of war rendering

The fog uses Konva layer compositing:

1. **FogLayer** — a `Layer` with `opacity={0.65}` (admin) or `1` (players). A full-canvas `Rect` covers everything, then `destination-out` rects punch holes for reveals, and `source-over` rects re-fog hide zones. The base rect uses `VIRTUAL_SIZE` (6000px) not the image dimensions — this prevents background bleed at high zoom where sub-pixel rounding can expose edges.
2. **FogAdminOverlay** — a separate `Layer` with semi-transparent green fills over reveal zones, so the admin can see boundaries without composite operations interfering.
3. **FogPreviewOutline** — a separate `Layer` rendered above tokens, showing a dashed border as the DM drags a new fog shape.

Each fog concern is a separate Konva Layer. Do not mix composite operations between layers — they interact in unexpected ways.

### Token size

Effective token size = `token.size ?? session.token_size ?? DEFAULT_TOKEN_SIZE`

- `session.token_size` is the default set by the DM for new tokens going forward. Changing it does **not** resize existing tokens.
- `token.size` is an explicit per-token override. `null` means "inherit from session default".
- When a new token is inserted, stamp `size: session.token_size` explicitly so future changes to the default don't affect it.
- `token.size_locked` — if `true`, the DM's batch resize (session-level slider) skips this token, and the per-token slider is disabled. The DM can lock/unlock tokens individually or all at once via "Lock all sizes" / "Unlock all sizes" in the DM tab.

**Auto-fit map view** — `MapCanvas` watches for `mapUrl` changes. When `mapUrl` changes and `imageBounds` is ready (image loaded), it calls `zoom.resetView()` once via a `useEffect` + `lastResetMapUrlRef` guard. This fires for all connected clients because `session.map_url` propagates via `postgres_changes`.

### Token icons

Tokens can display a portrait icon from the built-in library (`public/icons/`). The `image_url` column on `tokens` stores a relative path like `/icons/humans/fighter.png`. The field existed in the schema from the start but was unwired until now.

**Rendering** (`TokenShape.tsx`): when `image_url` is set, a Konva `Image` is clipped to an inner circle (radius − 4px) via `clipFunc` on a `Group`. The outer `Circle` stays filled with `token.color`, acting as a colored ring border. The name text label is hidden when a portrait is shown; the HP bar is always visible.

**Picker** (`IconPicker.tsx`): an inline expandable panel with 4 category tabs (Humans, Fantasy, Creatures, Animals) and a scrollable icon grid. Opens from the color swatch in each token row (owner/DM only) and from the Add Token form. Selecting an icon calls `upsertToken` optimistically then `supabase.from('tokens').update({ image_url })`.

**Icon manifest** (`src/lib/icons.ts`): exports `ICONS: IconEntry[]`, `ICON_CATEGORIES`, and `getIconsByCategory(category)`. To add icons: drop a PNG into `public/icons/{category}/`, add an entry to `ICONS`.

**Assets**: ~86 CC0 pixel-art portraits (32×32 upscaled to 128×128) from the Dungeon Crawl Stone Soup tile set, organized into `animals/`, `creatures/`, `fantasy/`, `humans/`.

### Theme system

Three named themes (Obsidian Grimoire / Arcane Scroll / Arcane Neon) are stored as `session.theme` (text, CHECK constraint) and propagate to all clients via the existing `postgres_changes` sessions handler.

**CSS layer:** `[data-theme]` attribute blocks in `globals.css` define all `--theme-*` CSS custom properties. `layout.tsx` sets `data-theme="grimoire"` on `<body>` as the default. A `useEffect` in `SessionView` overrides it to `session.theme` on mount and on change.

**Canvas layer:** `src/lib/themeTokens.ts` exports `getThemeTokens(theme): ThemeTokens` — a pure lookup function returning `fogColor`, `fogAdminOpacity`, `fogPreviewStroke`, and `tokenRing`. `SessionView` calls this and passes the result as a `themeTokens` prop to `MapCanvas`. `MapCanvas` mirrors it in `themeTokensRef` for stale-closure safety.

**DM theme switcher:** In the DM tab, three buttons update `session.theme` optimistically via `setSession` then `await supabase.from('sessions').update(...)`.

**Pitfalls:**
- Never hardcode Tailwind color classes in components — use `var(--theme-*)` inline styles or CSS var references
- The `fogColor` value replaces the hardcoded `"#0f172a"` fill in **all three** fog Rect usages in `FogLayer` (base rect + hide-zone rects)
- `FogPreviewOutline` has a separate `fogPreviewStroke` prop — do not use `fogColor` for it
- Semantic colors (HP green/yellow/red, damage red, heal green) are **not** theme-specific and must not be replaced by theme vars

---

## Key files and their responsibilities

| File | Responsibility |
|---|---|
| `src/types/index.ts` | All shared interfaces — `Session`, `Token`, `FogShape`, `BroadcastEvent` |
| `src/store/session.ts` | Zustand store — single source of truth for all client state |
| `src/lib/useRealtimeSession.ts` | All Supabase Realtime subscriptions; returns broadcast helpers and `lockedBy` |
| `src/lib/mapUtils.ts` | Map constants (`VIRTUAL_SIZE`, `SCALE_BY`, `MIN/MAX_SCALE`, etc.) and `clampStagePos` |
| `src/lib/useImageSize.ts` | Hook that returns `{width, height}` for a given image URL |
| `src/components/map/MapCanvas.tsx` | Konva Stage orchestrator — zoom, pan, fog painting, auto-fit on map change. Accepts `fogTool`, `pendingTokenSize`, `tokenSizeScope` as props from SessionView. |
| `src/components/map/TokenShape.tsx` | Single token shape with drag, HP bar, portrait icon rendering |
| `src/components/map/FogLayer.tsx` | `FogLayer`, `FogAdminOverlay`, `FogPreviewOutline` exports |
| `src/components/map/MapControls.tsx` | HTML overlay for zoom in/out/reset — draggable, hidable (✕ to collapse, 🔍 to restore) |
| `src/components/session/TokenPanel.tsx` | Sidebar token list: add, visibility toggle, delete, per-token size, icon picker |
| `src/components/session/IconPicker.tsx` | Inline icon picker with category tabs and thumbnail grid |
| `src/lib/icons.ts` | Icon manifest — `ICONS[]`, `ICON_CATEGORIES`, `getIconsByCategory()` |
| `src/lib/themeTokens.ts` | Theme token lookup — `getThemeTokens(theme): ThemeTokens` for Konva canvas values |
| `public/icons/` | Static portrait PNGs organized by category (animals/creatures/fantasy/humans) |
| `src/app/page.tsx` | Lobby — identity (name + color), two-column Create / Join grid, slate dark theme |
| `src/app/session/[id]/SessionView.tsx` | Client shell: tabbed sidebar (👑 Dungeon Master / Tokens / Dice), lifted fog/size state, end session |
| `supabase/schema.sql` | Base schema — run this first on a new project |
| `supabase/migrations/` | Incremental changes — apply in order (001 → 013) after schema.sql |

---

## RLS rules (as of migrations 001–013)

| Operation | Who |
|---|---|
| INSERT token | Session owner, OR any authenticated user where `owner_id = auth.uid()` |
| UPDATE token | Token owner OR session owner (three separate policies after migration 008) |
| DELETE token | Token owner OR session owner |
| UPDATE/DELETE session | Session owner only |
| INSERT storage object (maps bucket) | Any session owner (any session they own — path restriction enforced by app) |
| UPDATE/DELETE storage object | Session owner whose session ID matches `split_part(name, '/', 1)` |

---

## Common patterns

### Adding icons to the library

1. Drop a 128×128px PNG into `public/icons/{category}/name.png`
2. Add an `IconEntry` to `ICONS` in `src/lib/icons.ts`
3. No migration or DB change needed — `image_url` is already a column on `tokens`

### Adding a new session-level setting

1. Add column to `sessions` in a new migration file (e.g. `011_my_setting.sql`)
2. Add the field to `Session` in `src/types/index.ts`
3. In `SessionView.tsx`: add UI control, call `setSession({ ...s, my_setting: val })` optimistically, then `supabase.from('sessions').update(...)` to persist
4. Other clients receive via the existing `postgres_changes` sessions handler in `useRealtimeSession.ts` → `setSession()`
5. Sessions table is already in the `supabase_realtime` publication (migration 003), so no extra setup needed

### Adding a new token field

1. Add column to `tokens` in a migration
2. Add the field to `Token` in `src/types/index.ts`
3. Optimistic update via `upsertToken({ ...token, my_field: val })` + DB `update`
4. Other clients receive via existing `postgres_changes` tokens UPDATE handler → `upsertToken()`

### Adding a new broadcast event

1. Add a new variant to `BroadcastEvent` in `src/types/index.ts`
2. Add a sender function in `useRealtimeSession.ts` (alongside `broadcastTokenMove`, etc.)
3. Add a handler in the `channel.on('broadcast', ...)` block in `useRealtimeSession.ts`
4. Return the new sender from the hook and pass it down through `SessionView` → `MapCanvas` (or wherever needed)

---

## Pitfalls to avoid

- **Never use image dimensions as the fog base rect size** — use `VIRTUAL_SIZE` (6000) to prevent edge bleed at high zoom.
- **Never check `old.session_id` in a postgres_changes DELETE handler** — REPLICA IDENTITY DEFAULT only sends PK. Use `removeToken(old.id)` directly.
- **Never add `SCALE_BY` or other `mapUtils` constants to components that don't use them directly** — they're passed in as callbacks from MapCanvas, not imported into child components.
- **Always `await` Supabase writes that need to propagate via realtime** — Supabase JS v2 is lazy; without `await` the HTTP request is never sent, `postgres_changes` never fires, and other clients never see the update. The per-token size slider's `onPointerUp` was bitten by this; don't repeat it.
- **fog_history cap is 50** — check `fogHistory.length >= 50` before appending. When at the cap, disable the fog paint tools entirely rather than silently dropping entries.
- **`page.tsx` uses `"use client"` and `export const dynamic = "force-dynamic"`** — do not add `async` or server-only code to it.
- **Favicon is `src/app/icon.svg`** (Next.js App Router file convention), not `public/favicon.ico`. The file in `public/favicon.svg` is a static fallback.
- **Do not put `clipFunc` directly on a Konva `Image` node** — place it on a wrapping `Group` instead. The clip coordinate origin in a `with check` behaves inconsistently on leaf nodes; on a `Group` it reliably centers at (0, 0) of the group's local space.
- **Storage `with check` must not use `split_part(name, '/', 1)`** — Supabase Storage does not reliably expose `name` in `with check` clauses for either INSERT or UPDATE. This causes "new row violates row-level security policy" even for valid session owners. The `split_part` pattern is safe **only** in `using` clauses (INSERT has no `using`; UPDATE/DELETE `using` evaluates against the existing row where `name` is reliable). Fix: simplify both INSERT and UPDATE `with check` to `bucket_id = 'maps' and auth.uid() is not null`. App-layer `isOwner` guards and the UPDATE `using` clause enforce actual ownership. See migrations 010 and 015.
