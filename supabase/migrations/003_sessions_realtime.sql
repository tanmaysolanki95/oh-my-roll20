-- Allow postgres_changes events to fire for session updates (map_url, grid_size, token_size)
alter publication supabase_realtime add table sessions;
