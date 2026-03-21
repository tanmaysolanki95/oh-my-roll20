-- Allow token owners (players) to delete their own tokens
drop policy "Session owner can delete tokens" on tokens;

create policy "Users can delete tokens" on tokens
  for delete using (
    exists (select 1 from sessions where sessions.id = session_id and sessions.owner_id = auth.uid())
    or owner_id = auth.uid()
  );
