-- supabase/migrations/014_theme.sql
ALTER TABLE sessions
  ADD COLUMN theme text NOT NULL DEFAULT 'grimoire'
  CHECK (theme IN ('grimoire', 'scroll', 'neon'));
