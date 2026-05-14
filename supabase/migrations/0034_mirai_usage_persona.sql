-- PRD §7.9 — per-persona token tracking.
-- Adds `persona` column so usage is broken down by persona per user per month.
-- Budget enforcement still sums across all personas for the user.

alter table mirai_usage_log
  add column if not exists persona text not null default 'general';

-- Replace old (user_id, period_yyyymm) unique constraint with per-persona key.
alter table mirai_usage_log
  drop constraint if exists mirai_usage_log_user_id_period_yyyymm_key;

alter table mirai_usage_log
  add constraint mirai_usage_log_user_period_persona_key
  unique (user_id, period_yyyymm, persona);

-- RLS: no change needed — existing policies cover the table.
