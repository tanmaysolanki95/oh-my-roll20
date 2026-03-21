-- Add grid_enabled column to sessions (default true so existing sessions keep the grid)
alter table sessions add column if not exists grid_enabled boolean not null default true;
