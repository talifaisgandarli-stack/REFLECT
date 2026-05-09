-- 0012: MIRAI feedback table (PRD §7.9) + persona enum additions + ICP fit type fix.
--
-- PRD §7.9: "User satisfaction thumbs (mirai_feedback table)"
-- PRD US-CRM-03: ai_icp_fit ∈ {Excellent/Good/Medium/Low} — schema 0001 had numeric (mismatch).
-- New personas added (PRD §7.2): operations_director, legal, strategist, team_assistant.

-- ── Persona enum additions ──────────────────────────────────────────────────
alter type mirai_persona add value if not exists 'operations_director';
alter type mirai_persona add value if not exists 'legal';
alter type mirai_persona add value if not exists 'strategist';
alter type mirai_persona add value if not exists 'team_assistant';

-- ── mirai_feedback (PRD §7.9) ───────────────────────────────────────────────
create table if not exists mirai_feedback (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references profiles(id) on delete cascade,
  message_id      uuid references mirai_messages(id) on delete set null,
  conversation_id uuid references mirai_conversations(id) on delete cascade,
  thumb           text not null check (thumb in ('up', 'down')),
  created_at      timestamptz not null default now()
);

alter table mirai_feedback enable row level security;
create policy mf_self   on mirai_feedback for select using (user_id = auth.uid());
create policy mf_insert on mirai_feedback for insert with check (user_id = auth.uid());
create policy mf_admin  on mirai_feedback for all    using (is_admin());

-- ── ai_icp_fit: numeric → text (PRD US-CRM-03) ─────────────────────────────
-- Schema 0001 defined ai_icp_fit as numeric. PRD says Excellent/Good/Medium/Low (text).
-- Additive: rename old column _deprecated, add correct text column.
alter table clients rename column ai_icp_fit to _deprecated_ai_icp_fit;
alter table clients add column if not exists ai_icp_fit text
  check (ai_icp_fit in ('Excellent', 'Good', 'Medium', 'Low'));
