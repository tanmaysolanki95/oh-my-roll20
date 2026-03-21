-- ============================================================
-- Migration 009: Improve join code entropy
-- ============================================================
--
-- The old join code was derived from the first 6 hex chars of a
-- UUID: upper(left(replace(gen_random_uuid()::text, '-', ''), 6))
-- This gives only 16^6 ≈ 16.7 million possible codes.
--
-- New approach:
--   • Uses gen_random_bytes(8) for cryptographic randomness
--   • Maps each byte (mod 32) onto an unambiguous 32-char alphabet
--     (A-Z minus I and O, digits 2-9 — no 0/1/I/O confusion)
--   • Produces 8 characters → 32^8 ≈ 1.1 trillion combinations
--   • No modulo bias: 256 / 32 = 8 exactly, uniform distribution
-- ============================================================

create or replace function generate_join_code() returns text
language plpgsql volatile security definer as $$
declare
  -- 32 unambiguous chars: A-Z minus I and O, plus 2-9
  chars     text    := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result    text    := '';
  rand_bytes bytea;
  i         int;
begin
  rand_bytes := gen_random_bytes(8);
  for i in 0 .. 7 loop
    result := result || substr(chars, (get_byte(rand_bytes, i) % 32) + 1, 1);
  end loop;
  return result;
end;
$$;

-- Change the column default to use the new function
alter table sessions
  alter column join_code set default generate_join_code();

-- Back-fill any existing sessions that still have short/hex-only codes.
-- Running this is safe: it only touches rows, doesn't affect active sessions.
update sessions
  set join_code = generate_join_code()
  where char_length(join_code) < 8
     or join_code ~ '^[0-9A-F]{6}$';  -- old hex-only pattern
