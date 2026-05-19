-- 0044 down — PRD §10.2: rename, never drop.

alter table mirai_conversations
  rename column pinned_at to _deprecated_pinned_at;
