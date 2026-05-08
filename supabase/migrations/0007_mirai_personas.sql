-- Align mirai_persona with PRD §7.2 (7 personas).
--
-- §7.2 lists: Əməliyyat Direktoru / Layihə Mühəndisi / Hüquqşünas (RAG) /
-- Marketinq Direktoru (CMO) / Maliyyə Analitiki / Strateq + Komanda Köməkçisi.
-- The 0001 enum was missing legal, strategist, ops_director. hr_partner is a
-- legacy value not in PRD §7.2; per the user decision (logged in commit body)
-- we keep it to avoid touching any historical conversation rows.
--
-- ALTER TYPE ... ADD VALUE caveats:
-- - Postgres ≥12 allows ADD VALUE inside a transaction, but the new value
--   cannot be referenced in the SAME transaction. We don't do that here.
-- - IF NOT EXISTS keeps the migration idempotent.

alter type mirai_persona add value if not exists 'legal';
alter type mirai_persona add value if not exists 'strategist';
alter type mirai_persona add value if not exists 'ops_director';
