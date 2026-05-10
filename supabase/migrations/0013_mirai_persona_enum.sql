-- PRD §7.2 — MIRAI persona keys used by UI/API but absent from the original enum.
-- Codebase references: src/pages/Mirai.tsx, src/pages/Clients.tsx (ICP enrichment),
-- api/mirai/chat.ts personas map. Without these values, every persona-scoped
-- conversation insert fails with "invalid input value for enum mirai_persona".
--
-- alter type ... add value must run outside a transaction in some clients;
-- Supabase migration runner handles this. `if not exists` keeps it idempotent.

alter type mirai_persona add value if not exists 'operations_director';
alter type mirai_persona add value if not exists 'legal';
alter type mirai_persona add value if not exists 'strategist';
alter type mirai_persona add value if not exists 'team_assistant';
