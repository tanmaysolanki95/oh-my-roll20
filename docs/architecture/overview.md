# Architecture Overview

## Stack

- **Next.js 16** (App Router) on Vercel — `"use client"` components throughout; SSR only for the session page's initial data fetch
- **Supabase** — Postgres DB, Realtime (broadcast + postgres_changes + presence), Storage (map images), anonymous auth
- **React-Konva** — canvas rendering for the map, tokens, fog
- **Zustand** — single global client-side store
- **Tailwind CSS** + CSS custom properties for theming

---

## Two pages

**`/` (`page.tsx`)** — Lobby. "Create Session" or "Join by code." On create, does an anonymous `supabase.auth.signInAnonymously()` (if no UID yet), inserts a `sessions` row, optionally uploads a map, then redirects. On join, looks up the session by 6-char `join_code` and redirects.

**`/session/[id]`** — The actual game. A server component (`page.tsx`) fetches the session row from Supabase and passes it as `initialSession` to `SessionView` (a client component). This avoids a loading flash for the map and session settings.

---

## The Supabase realtime channel

Every client in a session connects to a single Supabase Realtime channel named `session:{id}`. It carries three distinct mechanisms on the same channel:

```
┌────────────────────────────────────────────────────┐
│             session:{id}  channel                  │
│                                                    │
│  Broadcast (fire-and-forget, no DB write)          │
│  ├─ token_move      live drag position @ ~20fps    │
│  ├─ token_drag_start/end  drag lock/unlock         │
│  ├─ dice_roll       roll result to all players     │
│  └─ session_ended   DM ended session → redirect    │
│                                                    │
│  Postgres Changes (DB-persisted writes)            │
│  ├─ tokens INSERT/UPDATE/DELETE                    │
│  └─ sessions UPDATE (map, grid, fog, theme, …)     │
│                                                    │
│  Presence (connected players list)                 │
│  └─ sync → { user_id, player_name, color }[]       │
└────────────────────────────────────────────────────┘
```

`useRealtimeSession.ts` owns all of this. It sets up the channel, registers all handlers, loads initial data (tokens + dice log) after subscribing, and returns broadcast sender functions. The broadcast senders are passed down through `SessionView` → `MapCanvas` / `DiceRoller` as props.

---

## State flow pattern

Every mutation follows this exact sequence — never skip a step:

```
1. Optimistic update  →  useSessionStore setter  (UI responds instantly)
2. Persist            →  await supabase.from(...).update/insert  (write to DB)
3. Propagate          →  postgres_changes fires on all other clients
                          → their useRealtimeSession handler calls same store setter
```

The Zustand store (`store/session.ts`) is the single source of truth for all runtime state: the session row, tokens array, dice log, presence list, player identity. It never holds derived or ephemeral data — live drag positions stay in Konva's local state during the drag and only write to the store on `dragEnd`.

---

## Component tree

```
SessionView  (owns: fogTool, pendingTokenSize, tokenSizeScope, sidebarWidth, activeTab)
├─ PresenceBar          connected players (from store.presence)
├─ DiceToast            Apple-style overlay, appears on every dice roll
├─ MapCanvas  (dynamic, ssr:false)
│   ├─ FogLayer         Konva layer with compositing (full-canvas rect + destination-out reveals)
│   ├─ FogAdminOverlay  semi-transparent green tints over revealed zones (DM only)
│   ├─ FogPreviewOutline  dashed border while DM drags a new fog rect
│   ├─ TokenShape × N   each token: circle + HP bar + optional portrait, draggable
│   └─ MapControls      HTML overlay (zoom in/out/reset, draggable, hidable)
└─ Sidebar (tabbed)
    ├─ "DM" tab          map upload, fog reveal/hide tool, token size slider, theme switcher, end session
    ├─ "Tokens" tab  →  TokenPanel  add/remove/HP/visibility/size/icon per token
    └─ "Dice" tab    →  DiceRoller  quick buttons + expression input + result callout + roll log
```

`MapCanvas` is a `dynamic(() => import(...), { ssr: false })` because Konva requires browser APIs (`window`, `document`). It's never rendered on the server.

---

## Map canvas internals

The Konva stage has 5 layers in Z order:

| Layer | Contents |
|---|---|
| 1 | Background image (from Supabase Storage) + grid lines |
| 2 | Fog of war (full-canvas dark rect with `destination-out` punch-throughs for reveals) |
| 3 | Fog admin overlay (green tints so DM can see zone boundaries) |
| 4 | Tokens (always above fog) |
| 5 | Fog paint preview outline (above tokens while DM drags) |

Zoom and pan use refs (`stageScaleRef`, `stagePosRef`) not React state — long-lived mouse handlers read `.current` to avoid stale closure bugs. The same ref pattern applies to anything handlers need to read: `imageBoundsRef`, `sizeRef`, etc.

---

## Auth

All users are anonymous Supabase auth users — `signInAnonymously()` on create, or on first session interaction for players who joined by code. The UID is persisted in localStorage via Supabase's JS client. RLS uses `auth.uid()` throughout: only session owners can update/delete their session or overwrite its map; tokens can be controlled by their `owner_id` or the session owner.

---

## Theme system

Three themes (`grimoire` / `scroll` / `neon`) live entirely in CSS custom properties (`--theme-accent`, `--theme-bg-deep`, etc.) defined on `[data-theme="..."]` blocks in `globals.css`. `SessionView` sets `document.body.setAttribute("data-theme", session.theme)` whenever the session theme changes — which propagates to all clients via `postgres_changes`. Canvas colors (fog color, token ring) aren't CSS — they're returned by `getThemeTokens(theme)` and passed as props to `MapCanvas`.

---

## Database

Three tables:

| Table | Key columns |
|---|---|
| `sessions` | `id`, `owner_id`, `join_code`, `map_url`, `theme`, `fog_shapes`, `fog_history`, `grid_size`, `token_size` |
| `tokens` | `id`, `session_id`, `owner_id`, `x`, `y`, `hp`, `max_hp`, `size`, `size_locked`, `visible`, `image_url` |
| `dice_rolls` | `id`, `session_id`, `player_name`, `expression`, `result`, `breakdown` |

One Supabase Storage bucket: `maps` (public). Path format: `{session_id}/map.{ext}`.
