-- 0038 — PRD §7: let users rename MIRAI conversations in the history list.
-- Additive: title is nullable, falls back to persona label in the UI.
-- Delete = soft delete via existing archived_at column (no schema change).

alter table mirai_conversations
  add column if not exists title text;
