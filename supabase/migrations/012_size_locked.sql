-- Allow DM to pin token sizes so batch-resize skips them
alter table tokens add column if not exists size_locked boolean not null default false;
