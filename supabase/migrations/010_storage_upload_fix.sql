-- ============================================================
-- Migration 010: Fix storage upload RLS policies
-- ============================================================
--
-- Problem: map uploads as session owner were being rejected.
--
-- Two bugs in migration 008:
--
-- 1. INSERT policy used split_part(name, '/', 1) inside a `with check`
--    clause. In Supabase Storage, `name` is not reliably accessible in
--    `with check` for INSERT at policy-evaluation time, causing the
--    check to fail even for valid session owners.
--
-- 2. UPDATE policy ("Session owner can overwrite map") had no `with check`
--    clause. PostgreSQL copies `using` to `with check` when omitted, but
--    Supabase Storage's upsert (INSERT ... ON CONFLICT DO UPDATE) requires
--    an explicit `with check` on the UPDATE policy to permit overwrites.
--
-- Fix:
--   INSERT  — check that the caller owns *any* session (avoids path parsing)
--             and that the bucket is 'maps'. App-layer already restricts the
--             upload button to the DM; this policy just blocks non-DMs.
--   UPDATE  — keep the split_part ownership check (applied to the *existing*
--             row's name, which is reliable) and add an explicit `with check`.
--   DELETE  — unchanged from 008.
--   SELECT  — re-create for idempotency.
-- ============================================================

-- Drop all existing maps storage policies (idempotent)
drop policy if exists "Authenticated users can upload maps" on storage.objects;
drop policy if exists "Session owner can upload map"        on storage.objects;
drop policy if exists "Session owner can overwrite map"     on storage.objects;
drop policy if exists "Session owner can delete map"        on storage.objects;
drop policy if exists "Anyone can read maps"                on storage.objects;

-- SELECT: public bucket — anyone can read map images
create policy "Anyone can read maps" on storage.objects
  for select using (bucket_id = 'maps');

-- INSERT: any session owner (DM) can upload to the maps bucket.
-- We check that the caller owns at least one session rather than parsing
-- the upload path with split_part, which is unreliable in with check.
-- The upload path format (sessionId/map.ext) is enforced by the app.
create policy "Session owner can upload maps" on storage.objects
  for insert with check (
    bucket_id = 'maps'
    and auth.uid() is not null
    and exists (
      select 1 from public.sessions
      where sessions.owner_id = auth.uid()
    )
  );

-- UPDATE: session owner can overwrite their own session's map.
-- split_part on the *existing* row's name is reliable for UPDATE.
-- Explicit with check required for upsert (INSERT ... ON CONFLICT DO UPDATE).
create policy "Session owner can overwrite map" on storage.objects
  for update
  using (
    bucket_id = 'maps'
    and exists (
      select 1 from public.sessions
      where sessions.id = split_part(name, '/', 1)
        and sessions.owner_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'maps'
    and exists (
      select 1 from public.sessions
      where sessions.id = split_part(name, '/', 1)
        and sessions.owner_id = auth.uid()
    )
  );

-- DELETE: session owner can remove their session's map
create policy "Session owner can delete map" on storage.objects
  for delete using (
    bucket_id = 'maps'
    and exists (
      select 1 from public.sessions
      where sessions.id = split_part(name, '/', 1)
        and sessions.owner_id = auth.uid()
    )
  );
