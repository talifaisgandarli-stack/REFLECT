-- RLS audit (PRD §9.1).
-- Fails (exits non-zero via psql --set ON_ERROR_STOP=on) when:
--   * a public.* table has rls disabled
--   * a public.* table has zero policies
--
-- Tables we explicitly excuse from policy-count check (read by anon via
-- security-definer RPCs only, so no policies needed):
--   none currently — the public retrospective survey uses RPC, the
--   underlying retrospective_surveys table is still policy-protected.

with public_tables as (
  select c.relname as table_name,
         c.relrowsecurity as rls_enabled
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where c.relkind = 'r'
     and n.nspname = 'public'
     -- Skip Supabase-managed schemas + archive tables (renamed per §10.2)
     and c.relname not like '\_archived\_%' escape '\'
     and c.relname not like '\_deprecated\_%' escape '\'
),
policy_counts as (
  select tablename as table_name, count(*) as n
    from pg_policies
   where schemaname = 'public'
   group by tablename
),
joined as (
  select pt.table_name, pt.rls_enabled, coalesce(pc.n, 0) as policy_count
    from public_tables pt
    left join policy_counts pc on pc.table_name = pt.table_name
)
select * from joined
order by table_name;

\echo
\echo === Tables with RLS DISABLED (must be empty) ===
do $$
declare bad int;
begin
  select count(*) into bad from (
    select c.relname from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where c.relkind = 'r' and n.nspname = 'public'
       and c.relrowsecurity = false
       and c.relname not like '\_archived\_%' escape '\'
       and c.relname not like '\_deprecated\_%' escape '\'
  ) bad_tables;
  if bad > 0 then
    raise exception 'RLS disabled on % public table(s)', bad;
  end if;
end $$;

\echo === Tables with NO policies (must be empty) ===
do $$
declare bad int;
begin
  select count(*) into bad from (
    select c.relname from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where c.relkind = 'r' and n.nspname = 'public'
       and c.relrowsecurity = true
       and c.relname not like '\_archived\_%' escape '\'
       and c.relname not like '\_deprecated\_%' escape '\'
       and not exists (
         select 1 from pg_policies p
          where p.schemaname = 'public' and p.tablename = c.relname
       )
  ) no_policy;
  if bad > 0 then
    raise exception 'RLS enabled but 0 policies on % public table(s)', bad;
  end if;
end $$;

\echo === RLS audit clean ===
