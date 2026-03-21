alter table sessions
  add column if not exists fog_history jsonb not null default '[]';
