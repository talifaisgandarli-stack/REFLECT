-- 0050 — PRD §6.x — two additive fields:
--   1. clients.industry — free-text tag (Tikinti, Mağaza, Restoran, etc.)
--   2. tasks.priority   — enum (low | medium | high) for sort/filter
--
-- Both additive + nullable; existing rows unaffected.

alter table clients
  add column if not exists industry text;

create index if not exists clients_industry_idx on clients (industry);

alter table tasks
  add column if not exists priority text
    check (priority in ('low', 'medium', 'high') or priority is null);

create index if not exists tasks_priority_idx on tasks (priority) where priority is not null;
