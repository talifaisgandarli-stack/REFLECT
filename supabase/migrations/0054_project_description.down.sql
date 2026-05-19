-- 0054 down — PRD §10.2: rename, never drop.

alter table projects rename column description to _deprecated_description;
