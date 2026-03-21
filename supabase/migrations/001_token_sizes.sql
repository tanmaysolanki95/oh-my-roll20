-- Session-level default token size (DM sets, applies to tokens with no individual size)
alter table sessions add column token_size integer not null default 56;

-- Per-token size override (null = inherit session default)
alter table tokens add column size integer null;
