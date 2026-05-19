-- 0038 down — drop the optional title column (PRD §10.2: rename, never drop)
-- Following PRD §10.2: rename to a deprecated suffix instead of dropping.

alter table mirai_conversations
  rename column title to _deprecated_title;
