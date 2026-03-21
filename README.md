# oh-my-roll20

<img src="public/favicon.svg" width="64" alt="oh-my-roll20 logo" />

A lightweight virtual tabletop (VTT) for D&D sessions with friends. Built to be hosted entirely for free.

## Features

- **Shared map** — upload any image as a map background, overlaid with a customisable grid
- **Tokens** — drag character tokens around the map with real-time position sync
- **HP tracking** — per-token HP bars visible and editable by the token owner or DM
- **Token ownership** — players place and own their own tokens; only the owner (or DM) can move or delete them
- **Token visibility** — DM can hide tokens from players (e.g. pre-place NPCs) and reveal them at will
- **Per-token size** — each token can have its own size; DM sets a session-level default for new tokens
- **Max tokens per player** — DM can cap how many tokens each player can place (default: 1)
- **Fog of war** — DM paints rectangular reveal/hide zones over the map; players only see revealed areas; all changes are real-time
- **Token drag locking** — when a player is dragging their token the DM is automatically locked out, preventing conflicts
- **Join codes** — short 6-character uppercase codes (e.g. `A3F2B9`) so players can join without a raw UUID URL
- **Session ending** — DM can end a session and immediately redirect all connected players to the lobby
- **Dice roller** — full expression parser (`3d20+10`, `2d6-1`, etc.) with a shared roll log
- **Real-time** — all state syncs across all connected clients in ~100ms
- **d20 logo** — fantasy-themed app icon shown in the browser tab and lobby header

## Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | Next.js 16 (App Router) | Familiar, Vercel-native, React Compiler |
| Styling | Tailwind CSS | Utility-first, no build overhead |
| Canvas | React-Konva | Declarative canvas API, clean drag-and-drop |
| State | Zustand | Lightweight, no boilerplate |
| Backend / DB | Supabase (Postgres) | Free tier, built-in realtime, auth, storage |
| Real-time | Supabase Realtime | Broadcast (ephemeral) + Postgres Changes (persistent) |
| Hosting | Vercel | Free tier, auto-deploys from GitHub |

### Real-time architecture

Three Supabase Realtime primitives are used for different things:

```
Broadcast channel  →  token drag positions (~20fps throttled), drag-start/drag-end lock events, session_ended
Postgres Changes   →  HP updates, final token positions, map URL, fog shapes, token visibility, session settings
Presence           →  who is connected to a session
```

This separation keeps fast/ephemeral events off the database and ensures persistent state is always recoverable on page load.

## Local development

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier is fine)

### 1. Clone and install

```bash
git clone https://github.com/tanmaysolanki95/oh-my-roll20
cd oh-my-roll20
npm install
```

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → New project
2. **Authentication → Providers → Anonymous** → enable it
3. **SQL Editor** → paste and run `supabase/schema.sql`
4. If you hit a `pg_cron` error, first enable it under **Database → Extensions → pg_cron**, then re-run the schema
5. Apply all numbered migration files in `supabase/migrations/` in order (001 → 007)

### 3. Configure environment variables

```bash
cp .env.local.example .env.local
# Fill in your Supabase project URL and anon key
# Find them at: Project Settings → Data API
```

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Database schema

```
sessions
  id                    text  PK
  name                  text
  map_url               text  (Supabase Storage public URL)
  grid_size             int   (pixel size of each grid cell, default 60)
  token_size            int   (default token size for new tokens, default 56)
  fog_enabled           bool  (whether fog of war is active, default false)
  fog_shapes            jsonb (array of {x,y,w,h,type:"reveal"|"hide"} shapes)
  join_code             text  UNIQUE (6-char uppercase code for joining, e.g. A3F2B9)
  max_tokens_per_player int   (max tokens a non-DM player can place, default 1)
  owner_id              uuid  (FK → auth.users — the DM)
  created_at            timestamptz

tokens
  id          text  PK
  session_id  text  FK → sessions (cascade delete)
  name        text
  color       text
  hp          int
  max_hp      int
  x, y        float (canvas pixel position)
  image_url   text  (reserved for token portraits)
  owner_id    uuid  FK → auth.users, nullable (null = DM-owned / unclaimed)
  size        int   nullable (per-token override; null = use session.token_size)
  visible     bool  (whether players can see this token, default true)
  created_at  timestamptz

dice_rolls
  id          text  PK
  session_id  text  FK → sessions (cascade delete)
  player_name text
  expression  text  (e.g. "3d20+5")
  result      int
  breakdown   text  (e.g. "[12, 4, 1] + 5")
  created_at  timestamptz  (TTL: auto-deleted after 24h via pg_cron)
```

## Row-level security model

| Operation | Who |
|---|---|
| Read sessions / tokens / rolls | Anyone (session ID acts as the access code) |
| Create session | Any authenticated user; `owner_id` must equal `auth.uid()` |
| Update / delete session | Session owner only |
| Insert token | Session owner (DM), OR any authenticated player inserting their own token (`owner_id = auth.uid()`) |
| Update token (move, HP, size, visibility) | Token owner OR session owner |
| Delete token | Token owner OR session owner |
| Insert dice roll | Any authenticated user |

Anonymous auth (`supabase.auth.signInAnonymously()`) is used — no email or password required. The anonymous session persists in `localStorage` so a player keeps their token ownership across refreshes.

## Migrations

Incremental schema changes live in `supabase/migrations/`. Apply them in order on top of the base `supabase/schema.sql`:

| File | What it does |
|---|---|
| `001_token_sizes.sql` | Adds `sessions.token_size` and `tokens.size` |
| `002_player_token_insert.sql` | Broadens token INSERT RLS so players can insert their own tokens |
| `003_sessions_realtime.sql` | Adds `sessions` table to the `supabase_realtime` publication |
| `004_fog_tokens.sql` | Adds `tokens.visible`, `sessions.fog_enabled`, `sessions.fog_shapes` |
| `005_join_code.sql` | Adds `sessions.join_code` (unique 6-char uppercase) |
| `006_token_delete_rls.sql` | Broadens token DELETE RLS so players can delete their own tokens |
| `007_max_tokens_per_player.sql` | Adds `sessions.max_tokens_per_player` |

## Deployment

The app is designed for free hosting:

- **Vercel** (frontend) — connect the GitHub repo, add the two env vars, deploy
- **Supabase** (backend) — free tier covers 200 concurrent connections, 500MB DB, 1GB storage

After deploying, add your production URL to Supabase under **Authentication → URL Configuration → Site URL**.

See the full deployment walkthrough in [DEPLOYING.md](./DEPLOYING.md).

## Project structure

```
src/
  app/
    icon.svg                  # d20 favicon (Next.js App Router file convention)
    page.tsx                  # Lobby (create / join session by code)
    session/[id]/
      page.tsx                # Server component — fetches session, renders SessionView
      SessionView.tsx         # Client shell — wires auth, realtime, map upload, end session
  components/
    map/
      MapCanvas.tsx           # Konva stage orchestrator — zoom, pan, fog painting
      TokenShape.tsx          # Single token: circle, label, HP bar, +/- buttons
      FogLayer.tsx            # FogLayer (player/admin fog), FogAdminOverlay, FogPreviewOutline
      FogToolbar.tsx          # HTML overlay: fog on/off, reveal/hide tool, clear
      MapControls.tsx         # HTML overlay: zoom in/out/reset, token size slider
    dice/DiceRoller.tsx       # Expression input + quick buttons + roll log
    session/
      TokenPanel.tsx          # Sidebar: add token, visibility toggle, delete, per-token size
      PresenceBar.tsx         # Header: session name, join code, players, end session
    ui/
      Logo.tsx                # d20 SVG React component (gradient, used in lobby)
  lib/
    mapUtils.ts               # Map constants (VIRTUAL_SIZE, SCALE_BY, etc.) + clampStagePos
    useImageSize.ts           # Hook: returns {width, height} of an image URL
    supabase/client.ts        # Singleton browser client
    dice.ts                   # Pure dice expression parser and roller
    useAuth.ts                # Anonymous auth hook
    useRealtimeSession.ts     # Supabase Realtime subscriptions + initial data load
  store/
    session.ts                # Zustand store — session, tokens, dice log, presence
  types/
    index.ts                  # Shared TypeScript interfaces
supabase/
  schema.sql                  # Full base DB schema, RLS policies, storage bucket, pg_cron job
  migrations/                 # Incremental schema changes (001–007)
public/
  favicon.svg                 # Flat d20 SVG (fallback / static reference)
```
