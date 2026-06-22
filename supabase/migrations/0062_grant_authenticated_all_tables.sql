-- Systemic 403 fix. Tables added in later migrations (e.g. project_favorites
-- 0049, time_entries 0052) never received table-level privileges for the
-- `authenticated` role, so PostgREST returned 403 "permission denied for table"
-- before RLS was ever evaluated — while early tables worked via the platform's
-- default privileges. Rather than grant table-by-table as each surfaces, align
-- the whole public schema with Supabase's standard model: grant DML to
-- `authenticated` on every table and future-proof via default privileges.
--
-- This does NOT weaken security: every one of these tables has RLS enabled, and
-- RLS (deny-by-default) remains the real boundary — a user still only reads or
-- writes the rows their policies permit. The grant only lets the role reach the
-- table at all. Idempotent.

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Future tables/sequences created in this schema inherit the same grants, so a
-- new migration can never silently reintroduce the 403 class.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;
