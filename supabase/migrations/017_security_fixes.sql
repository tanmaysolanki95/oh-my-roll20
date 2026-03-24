-- ============================================================
-- Migration 017: Security fixes
-- ============================================================

-- ----------------------------------------------------------------
-- 1. Enforce token visibility at the RLS layer
--
-- The old "Anyone can read tokens" policy (using true) allowed any
-- authenticated or anonymous client to read hidden tokens directly
-- via the Supabase API, bypassing the app-layer filter. Hidden
-- tokens should only be visible to the session owner (DM).
-- ----------------------------------------------------------------
drop policy "Anyone can read tokens" on tokens;

create policy "Read tokens with visibility check" on tokens
  for select using (
    visible = true
    or exists (
      select 1 from sessions
      where sessions.id = session_id
        and sessions.owner_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------
-- 2. Constrain token color to valid hex format
--
-- Without this, a crafted API request could store arbitrary strings
-- in the color column (e.g. "javascript:...", CSS injection values).
-- ----------------------------------------------------------------
alter table tokens
  add constraint token_color_hex
    check (color ~ '^#[0-9a-fA-F]{6}$') not valid;

-- ----------------------------------------------------------------
-- 3. Constrain token image_url to the built-in icon library
--
-- image_url stores a path like /icons/humans/fighter.png.
-- Without this, a crafted request could store an external URL,
-- causing all clients to fetch an attacker-controlled image.
-- Allow: /icons/{category}/{name}.png  OR  null (no icon)
-- ----------------------------------------------------------------
alter table tokens
  add constraint token_image_url_path
    check (
      image_url is null
      or image_url ~ '^/icons/[a-z]+/[a-z0-9_-]+\.png$'
    ) not valid;
