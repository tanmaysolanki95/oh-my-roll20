-- Sessions table
create table if not exists sessions (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  map_url text,
  grid_size integer not null default 60,
  owner_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

-- Tokens table
create table if not exists tokens (
  id text primary key default gen_random_uuid()::text,
  session_id text not null references sessions(id) on delete cascade,
  name text not null,
  color text not null default '#3b82f6',
  hp integer not null default 10,
  max_hp integer not null default 10,
  x float not null default 100,
  y float not null default 100,
  image_url text,
  owner_id uuid references auth.users(id), -- null = unclaimed
  created_at timestamptz not null default now()
);

-- Dice roll log
create table if not exists dice_rolls (
  id text primary key default gen_random_uuid()::text,
  session_id text not null references sessions(id) on delete cascade,
  player_name text not null,
  expression text not null,
  result integer not null,
  breakdown text not null,
  created_at timestamptz not null default now()
);

-- -------------------------
-- Row Level Security
-- -------------------------
alter table sessions enable row level security;
alter table tokens enable row level security;
alter table dice_rolls enable row level security;

-- Sessions: anyone can read (session ID acts as the access code)
create policy "Anyone can read sessions" on sessions
  for select using (true);

-- Sessions: only authenticated users can create, and they must set themselves as owner
create policy "Authenticated users can create sessions" on sessions
  for insert with check (auth.uid() is not null and owner_id = auth.uid());

-- Sessions: only the owner can update (e.g. map upload, grid size)
create policy "Owner can update session" on sessions
  for update using (owner_id = auth.uid());

-- Sessions: only the owner can end (delete) the session
create policy "Owner can delete session" on sessions
  for delete using (owner_id = auth.uid());

-- Tokens: anyone in the session can read
create policy "Anyone can read tokens" on tokens
  for select using (true);

-- Tokens: only the session owner (DM) can add tokens
create policy "Session owner can insert tokens" on tokens
  for insert with check (
    exists (
      select 1 from sessions
      where sessions.id = session_id
        and sessions.owner_id = auth.uid()
    )
  );

-- Tokens: token owner OR session owner (DM) can update (move, HP, claim)
-- The claim operation sets owner_id from null → auth.uid(), allowed for any authenticated user
-- on an unclaimed token.
create policy "Token owner or session owner can update tokens" on tokens
  for update using (
    owner_id = auth.uid()
    or owner_id is null          -- anyone can claim an unclaimed token
    or exists (
      select 1 from sessions
      where sessions.id = session_id
        and sessions.owner_id = auth.uid()
    )
  );

-- Tokens: only the session owner (DM) can delete tokens
create policy "Session owner can delete tokens" on tokens
  for delete using (
    exists (
      select 1 from sessions
      where sessions.id = session_id
        and sessions.owner_id = auth.uid()
    )
  );

-- Dice rolls: anyone in the session can read
create policy "Anyone can read dice_rolls" on dice_rolls
  for select using (true);

-- Dice rolls: any authenticated user can log a roll
create policy "Authenticated users can insert dice_rolls" on dice_rolls
  for insert with check (auth.uid() is not null);

-- -------------------------
-- TTL: auto-delete dice rolls older than 24 hours (runs every hour via pg_cron)
-- pg_cron is enabled by default on Supabase. Run this once in the SQL editor.
-- -------------------------
select cron.schedule(
  'dice-rolls-ttl',
  '0 * * * *',
  $$delete from dice_rolls where created_at < now() - interval '24 hours'$$
);

-- -------------------------
-- Realtime
-- -------------------------
alter publication supabase_realtime add table tokens;
alter publication supabase_realtime add table dice_rolls;

-- -------------------------
-- Storage: map images
-- -------------------------
insert into storage.buckets (id, name, public)
values ('maps', 'maps', true)
on conflict (id) do nothing;

-- Only the session owner can upload (enforced in app layer; storage policies are bucket-wide)
create policy "Authenticated users can upload maps" on storage.objects
  for insert with check (bucket_id = 'maps' and auth.uid() is not null);

create policy "Anyone can read maps" on storage.objects
  for select using (bucket_id = 'maps');
