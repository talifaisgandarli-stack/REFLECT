-- 0053 down — PRD §10.2: rename, never drop.

drop index if exists projects_tags_idx;

alter table projects rename column tags to _deprecated_tags;
