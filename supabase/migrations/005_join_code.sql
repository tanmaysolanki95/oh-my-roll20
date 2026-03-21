-- Short human-friendly join code generated from the session UUID
alter table sessions add column join_code text unique not null
  default upper(left(replace(gen_random_uuid()::text, '-', ''), 6));

-- Back-fill existing sessions
update sessions set join_code = upper(left(replace(gen_random_uuid()::text, '-', ''), 6))
  where join_code is null;
