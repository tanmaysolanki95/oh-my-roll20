-- Allow players to insert their own tokens (previously DM-only)
drop policy "Session owner can insert tokens" on tokens;

create policy "Users can add tokens to sessions" on tokens
  for insert with check (
    -- DM: session owner can insert any token (including unclaimed)
    exists (
      select 1 from sessions
      where sessions.id = session_id
        and sessions.owner_id = auth.uid()
    )
    or
    -- Players: can only insert tokens they own
    owner_id = auth.uid()
  );
