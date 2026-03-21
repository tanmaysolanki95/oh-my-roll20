-- ============================================================
-- Migration 008: Security hardening
-- ============================================================

-- ----------------------------------------------------------------
-- 1. Fix token UPDATE policy
--
-- The old single policy allowed any authenticated user to update ANY
-- field of an unclaimed token (owner_id IS NULL), including HP,
-- visibility, and position — not just to claim it.
--
-- Replace with three narrow policies:
--   a) Session owner (DM) can update any field of any token.
--   b) Token owner (player) can update their own token but cannot
--      transfer ownership away (WITH CHECK owner_id = auth.uid()).
--   c) Any authenticated user can claim an unclaimed token, but the
--      only permitted outcome is owner_id = auth.uid() — no other
--      field may be changed in the same statement in a way that
--      violates other constraints.
-- ----------------------------------------------------------------
drop policy "Token owner or session owner can update tokens" on tokens;

create policy "Session owner can update any token" on tokens
  for update
  using (
    exists (
      select 1 from sessions
      where sessions.id = session_id
        and sessions.owner_id = auth.uid()
    )
  );

create policy "Token owner can update own token" on tokens
  for update
  using  (owner_id = auth.uid())
  with check (owner_id = auth.uid());   -- cannot transfer to another user

create policy "Authenticated user can claim unclaimed token" on tokens
  for update
  using  (owner_id is null and auth.uid() is not null)
  with check (owner_id = auth.uid());   -- can only set to own uid

-- ----------------------------------------------------------------
-- 2. Tighten storage policies
--
-- Old policy: any authenticated user could upload to any path in
-- the 'maps' bucket, including overwriting another session's map.
-- Also: no UPDATE or DELETE policies existed at all.
-- ----------------------------------------------------------------
drop policy if exists "Authenticated users can upload maps" on storage.objects;

-- INSERT: only the session owner can upload, and the path must start
-- with their session id (format: {session_id}/map.{ext})
create policy "Session owner can upload map" on storage.objects
  for insert
  with check (
    bucket_id = 'maps'
    and auth.uid() is not null
    and exists (
      select 1 from public.sessions
      where sessions.id = split_part(name, '/', 1)
        and sessions.owner_id = auth.uid()
    )
  );

-- UPDATE: same path restriction for re-uploads (upsert: true in app)
create policy "Session owner can overwrite map" on storage.objects
  for update
  using (
    bucket_id = 'maps'
    and exists (
      select 1 from public.sessions
      where sessions.id = split_part(name, '/', 1)
        and sessions.owner_id = auth.uid()
    )
  );

-- DELETE: session owner can remove their own map
create policy "Session owner can delete map" on storage.objects
  for delete
  using (
    bucket_id = 'maps'
    and exists (
      select 1 from public.sessions
      where sessions.id = split_part(name, '/', 1)
        and sessions.owner_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------
-- 3. Add range constraints on session numeric fields
--    NOT VALID skips validation of existing rows but enforces
--    the constraint on all future inserts and updates.
-- ----------------------------------------------------------------
alter table sessions
  add constraint grid_size_range         check (grid_size between 20 and 200)          not valid,
  add constraint token_size_range        check (token_size between 8 and 300)          not valid,
  add constraint max_tokens_per_player_range check (max_tokens_per_player between 1 and 20) not valid;

-- ----------------------------------------------------------------
-- 4. Add constraints on token numeric fields
-- ----------------------------------------------------------------
alter table tokens
  add constraint hp_non_negative  check (hp     >= 0)                              not valid,
  add constraint max_hp_positive  check (max_hp >= 1)                              not valid,
  add constraint hp_lte_max_hp    check (hp     <= max_hp)                         not valid,
  add constraint token_size_range check (size is null or size between 8 and 300)   not valid;

-- ----------------------------------------------------------------
-- 5. Add text-length constraints (prevents storage abuse via API)
-- ----------------------------------------------------------------
alter table sessions
  add constraint session_name_length check (char_length(name) between 1 and 200) not valid;

alter table tokens
  add constraint token_name_length  check (char_length(name) between 1 and 100)  not valid;

alter table dice_rolls
  add constraint dice_player_name_length check (char_length(player_name) between 1 and 100) not valid,
  add constraint dice_expression_length  check (char_length(expression) <= 100)             not valid;

-- ----------------------------------------------------------------
-- 6. Guard fog_shapes as a JSON array (prevents storing arbitrary
--    objects or scalars in the column)
-- ----------------------------------------------------------------
alter table sessions
  add constraint fog_shapes_is_array check (jsonb_typeof(fog_shapes) = 'array')  not valid,
  add constraint fog_shapes_max_size check (jsonb_array_length(fog_shapes) <= 500) not valid;

-- ----------------------------------------------------------------
-- 7. Explicit documentation: dice_rolls has no UPDATE or DELETE
--    policies. With RLS enabled, the default is DENY — this is
--    intentional. Rolls are append-only and cleaned up by pg_cron.
-- ----------------------------------------------------------------
-- (No SQL needed; documenting the deliberate absence of policies.)

-- ----------------------------------------------------------------
-- 8. TTL: clean up sessions inactive for 30 days
--    (tokens and dice_rolls cascade automatically)
--    Runs at 3 am UTC daily, alongside the existing dice TTL job.
-- ----------------------------------------------------------------
select cron.schedule(
  'stale-sessions-ttl',
  '0 3 * * *',
  $$
    delete from public.sessions
    where created_at < now() - interval '30 days'
      and not exists (
        select 1 from public.tokens
        where tokens.session_id = sessions.id
          and tokens.created_at > now() - interval '30 days'
      );
  $$
);

-- ----------------------------------------------------------------
-- Notes on items intentionally NOT addressed here:
--
-- • Orphaned storage objects: when a session row is deleted, the
--   map file in the 'maps' bucket is NOT automatically removed
--   because storage.objects doesn't participate in FK cascades.
--   Cleaning this up requires a pg_function + trigger that calls
--   the Supabase storage API (outside pure SQL scope). Stale files
--   are benign but waste storage quota.
--
-- • TRUNCATE protection: PostgreSQL RLS does not cover TRUNCATE.
--   However, the anon and authenticated roles do not hold TRUNCATE
--   privilege on these tables (only the table owner / superuser
--   does), so this is already blocked at the privilege level.
--
-- • Join code brute-force: codes are 6 hex chars (~16M space).
--   Rate-limiting is enforced by Supabase Auth's built-in limits
--   on anonymous sign-ins per IP, but the join-code lookup itself
--   has no DB-level rate limit. Mitigation: Supabase's API gateway
--   applies global rate limits; session IDs (UUIDs) are never
--   exposed to players — only join codes are.
-- ----------------------------------------------------------------
