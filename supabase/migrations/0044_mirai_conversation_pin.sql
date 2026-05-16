-- 0044 — PRD §7 — let users pin important MIRAI conversations so they sort
-- to the top of the history list.
--
-- Additive: nullable timestamptz; null = not pinned. Pinned conversations
-- ordered by pinned_at desc; rest by last_message_at desc.

alter table mirai_conversations
  add column if not exists pinned_at timestamptz;
