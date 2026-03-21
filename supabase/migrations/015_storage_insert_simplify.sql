-- ============================================================
-- Migration 015: Simplify storage INSERT and UPDATE policies
-- ============================================================
--
-- Problem: The INSERT policy from migration 010 uses an exists()
-- subquery against public.sessions in its with check clause.
-- The UPDATE policy's with check uses split_part(name, '/', 1).
-- Both fail in practice because Supabase Storage does not reliably
-- expose the object name in with check clauses (INSERT or UPDATE).
--
-- The symptom: "new row violates row-level security policy" when:
--   1. Uploading a map for the first time (INSERT path)
--   2. Re-uploading a map that already exists (upsert → UPDATE path)
--      This happens when a map was uploaded in the lobby before
--      entering the session, and the DM then replaces it inside.
--
-- Fix: Simplify both INSERT and UPDATE with check to only require
-- an authenticated user and the correct bucket. The USING clause
-- on UPDATE still uses split_part on the *existing* row's name,
-- which is reliable, to enforce ownership on which rows can be
-- updated. The app layer enforces owner-only access via isOwner.
-- ============================================================

drop policy if exists "Session owner can upload maps"   on storage.objects;
drop policy if exists "Session owner can overwrite map" on storage.objects;

-- INSERT: any authenticated user can upload to the maps bucket.
-- The isOwner guard in SessionView and page.tsx blocks non-owners
-- from reaching this call; DB policy just requires authentication.
create policy "Session owner can upload maps" on storage.objects
  for insert with check (
    bucket_id = 'maps'
    and auth.uid() is not null
  );

-- UPDATE: USING checks ownership via the existing row's name
-- (split_part is reliable here — the row already exists in DB).
-- WITH CHECK is simplified to avoid the name-in-with-check bug.
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
    and auth.uid() is not null
  );
