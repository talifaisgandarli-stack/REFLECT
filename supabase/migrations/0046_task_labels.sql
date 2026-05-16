-- 0046 — PRD §6.x — task labels/tags for cross-status grouping (Design,
-- Refactor, Bug, etc.). text[] column to mirror assignee_ids/phases pattern.
-- Additive: nullable, default empty array.

alter table tasks
  add column if not exists labels text[] not null default '{}';

create index if not exists tasks_labels_idx on tasks using gin (labels);
