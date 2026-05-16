-- 0053 — PRD §6.x — free-form tags on projects (mirror of task labels).
-- Additive; nullable text[] default empty; indexed for filter queries.

alter table projects
  add column if not exists tags text[] not null default '{}';

create index if not exists projects_tags_idx on projects using gin (tags);
