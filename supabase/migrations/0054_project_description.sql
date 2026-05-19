-- 0054 — PRD §6.x — optional free-form description on projects.
-- Additive; nullable text; rendered in ProjectDetail Overview.

alter table projects
  add column if not exists description text;
