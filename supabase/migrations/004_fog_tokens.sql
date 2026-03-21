-- Per-token visibility flag (admin can hide tokens from players)
alter table tokens add column visible boolean not null default true;

-- Fog of war: enabled flag + ordered array of reveal/hide rectangles
alter table sessions add column fog_enabled boolean not null default false;
alter table sessions add column fog_shapes jsonb not null default '[]';
