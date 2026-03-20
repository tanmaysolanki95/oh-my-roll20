# oh-my-roll20

A lightweight virtual tabletop (VTT) for D&D sessions with friends. Built to be hosted entirely for free.

## Features

- **Shared map** — upload any image as a map background, overlaid with a customisable grid
- **Tokens** — drag character tokens around the map with real-time position sync
- **HP tracking** — per-token HP bars visible and editable by all players
- **Dice roller** — full expression parser (`3d20+10`, `2d6-1`, etc.) with a shared roll log
- **Session ownership** — the DM who creates a session has admin rights; players claim and control only their own token
- **Real-time** — all state syncs across all connected clients in ~100ms

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
Broadcast channel  →  token drag (live, ephemeral, ~20fps throttled)
Postgres Changes   →  HP updates, final token positions, map URL changes
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
  id          text  PK
  name        text
  map_url     text  (Supabase Storage public URL)
  grid_size   int   (pixel size of each grid cell, default 60)
  owner_id    uuid  (FK → auth.users — the DM)
  created_at  timestamptz

tokens
  id          text  PK
  session_id  text  FK → sessions (cascade delete)
  name        text
  color       text
  hp          int
  max_hp      int
  x, y        float (canvas pixel position)
  image_url   text  (reserved for token portraits)
  owner_id    uuid  FK → auth.users, nullable (null = unclaimed)
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
| Insert token | Session owner (DM) only |
| Update token (move, HP, claim) | Token owner OR session owner |
| Delete token | Session owner only |
| Insert dice roll | Any authenticated user |

Anonymous auth (`supabase.auth.signInAnonymously()`) is used — no email or password required. The anonymous session persists in `localStorage` so a player keeps their token ownership across refreshes.

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
    page.tsx                  # Lobby (create / join session)
    session/[id]/
      page.tsx                # Server component — fetches session, renders SessionView
      SessionView.tsx         # Client shell — wires auth, realtime, map upload
  components/
    map/MapCanvas.tsx         # Konva stage — map background, grid, token layer
    dice/DiceRoller.tsx       # Expression input + quick buttons + roll log
    session/
      TokenPanel.tsx          # Sidebar token list — add, claim, HP controls
      PresenceBar.tsx         # Header — session name, connected players, end session
  lib/
    supabase/client.ts        # Singleton browser client
    dice.ts                   # Pure dice expression parser and roller
    useAuth.ts                # Anonymous auth hook
    useRealtimeSession.ts     # Supabase Realtime subscriptions + initial data load
  store/
    session.ts                # Zustand store — session, tokens, dice log, presence
  types/
    index.ts                  # Shared TypeScript interfaces
supabase/
  schema.sql                  # Full DB schema, RLS policies, storage bucket, pg_cron job
```
