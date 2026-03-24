-- ============================================================
-- Migration 018: Session membership, dice_rolls RLS, storage lock
-- ============================================================

-- ----------------------------------------------------------------
-- 1. Session membership table
--
-- Records which users have joined which sessions. Used to enforce
-- that token claiming is limited to actual participants rather
-- than any authenticated user across the entire platform.
-- ----------------------------------------------------------------
create table session_members (
  session_id text not null references sessions(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (session_id, user_id)
);

alter table session_members enable row level security;

-- Any authenticated user can record themselves as joining
create policy "User can join session" on session_members
  for insert with check (auth.uid() = user_id);

-- Any authenticated user can see session membership
create policy "Authenticated users can view members" on session_members
  for select using (auth.uid() is not null);

-- Users can remove themselves; session owner can remove anyone
create policy "User or owner can remove membership" on session_members
  for delete using (
    auth.uid() = user_id
    or exists (
      select 1 from sessions
      where sessions.id = session_id
        and sessions.owner_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------
-- 2. Restrict token claiming to session members
--
-- The old policy allowed any authenticated user on the platform
-- to claim any unclaimed token in any session they could look up.
-- Now the claimant must have a row in session_members for that
-- specific session, which is inserted when they join the session.
-- ----------------------------------------------------------------
drop policy "Authenticated user can claim unclaimed token" on tokens;

create policy "Session member can claim unclaimed token" on tokens
  for update
  using (
    owner_id is null
    and auth.uid() is not null
    and exists (
      select 1 from session_members
      where session_members.session_id = tokens.session_id
        and session_members.user_id    = auth.uid()
    )
  )
  with check (owner_id = auth.uid());

-- ----------------------------------------------------------------
-- 3. Restrict dice_rolls reads to authenticated users
--
-- The old policy (using true) exposed rolls to anonymous requests,
-- enabling unauthenticated cross-session enumeration. Authenticated
-- users can still read all session rolls they're aware of; full
-- per-session isolation would require an explicit access-grant
-- mechanism not yet present in this schema.
-- ----------------------------------------------------------------
drop policy "Anyone can read dice_rolls" on dice_rolls;

create policy "Authenticated users can read dice_rolls" on dice_rolls
  for select using (auth.uid() is not null);

-- ----------------------------------------------------------------
-- 4. Lock storage INSERT to service_role only
--
-- Migration 015 simplified the INSERT policy to auth-only because
-- Supabase Storage does not reliably expose object name in WITH CHECK
-- for INSERT, making ownership checks impossible client-side.
-- Fix: drop the INSERT policy entirely. Client-side direct uploads
-- are now denied. All uploads route through /api/upload-map which
-- uses the service role key server-side after verifying ownership.
-- UPDATE and DELETE are unchanged — their USING clause checks
-- ownership via the existing row's name (reliable for non-INSERT).
-- ----------------------------------------------------------------
drop policy if exists "Session owner can upload maps" on storage.objects;
drop policy if exists "Session owner can upload map"  on storage.objects;
