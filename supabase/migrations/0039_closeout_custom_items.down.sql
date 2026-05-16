-- 0039 down — PRD §10.2: rename, never drop.

alter table closeout_checklists
  rename column custom_items to _deprecated_custom_items;
