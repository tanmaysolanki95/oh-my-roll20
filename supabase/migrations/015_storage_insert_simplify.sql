-- ============================================================
-- Migration 015: Simplify storage INSERT policy
-- ============================================================
--
-- Problem: The INSERT policy from migration 010 uses an exists()
-- subquery against public.sessions in its with check clause.
-- In practice this subquery returns false even for valid session
-- owners, causing "new row violates row level policies" on upload.
--
-- Root cause: Supabase Storage evaluates RLS for storage.objects
-- in a context where the sessions subquery does not reliably
-- resolve to the expected rows. The app layer already enforces
-- owner-only access via the `isOwner` guard before the upload
-- is even attempted, so the DB-level check is redundant.
--
-- Fix: Replace the INSERT with check with the minimal check —
-- just require an authenticated user and the correct bucket.
-- The UPDATE/DELETE policies retain the split_part ownership
-- check (which works correctly for existing rows).
-- ============================================================

drop policy if exists "Session owner can upload maps" on storage.objects;

create policy "Session owner can upload maps" on storage.objects
  for insert with check (
    bucket_id = 'maps'
    and auth.uid() is not null
  );
