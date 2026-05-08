-- REQ-FIN-05 — materialize recurring_expenses into expenses.
--
-- PRD §3.2 says "pg_cron materializes monthly entries into expenses". We
-- ship the function here and call it from /api/cron/recurring-expenses
-- (Vercel cron) for environments that don't have pg_cron enabled. The
-- equivalent pg_cron schedule is included as a comment for the operator
-- to run after `create extension pg_cron;` in the Supabase dashboard.
--
-- Idempotency: the function uses a "claim and advance" pattern. For each
-- rule whose next_run_at <= now(), it advances next_run_at by the period
-- and inserts ONE expenses row tagged with recurring_rule_id and
-- occurred_at = the just-claimed next_run_at. If a previous run already
-- inserted that exact (rule_id, occurred_at) pair, the unique index
-- protects against duplicates. Concurrent runs are serialized via
-- FOR UPDATE SKIP LOCKED.

-- One materialized expense per (rule, occurrence). Belt-and-braces.
create unique index if not exists expenses_recurring_unique
  on expenses (recurring_rule_id, occurred_at)
  where recurring_rule_id is not null;

create or replace function public.materialize_recurring_expenses()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  inserted int := 0;
  step interval;
begin
  for rec in
    select id, label, amount, period, next_run_at
      from recurring_expenses
     where next_run_at <= now()
     order by next_run_at
     for update skip locked
  loop
    step := case rec.period
      when 'weekly'    then interval '7 days'
      when 'monthly'   then interval '1 month'
      when 'quarterly' then interval '3 months'
      when 'yearly'    then interval '1 year'
    end;

    -- Insert before advancing so the row is tagged with the just-due slot.
    insert into expenses (
      project_id, category, vendor, amount, occurred_at, note, recurring_rule_id
    ) values (
      null, 'recurring', rec.label, rec.amount, rec.next_run_at,
      'auto: ' || rec.label, rec.id
    )
    on conflict (recurring_rule_id, occurred_at) where recurring_rule_id is not null
      do nothing;

    -- Advance the rule. Loop in case multiple periods are overdue (so a long
    -- outage doesn't lose entries).
    while rec.next_run_at <= now() loop
      rec.next_run_at := rec.next_run_at + step;
    end loop;
    update recurring_expenses
       set next_run_at = rec.next_run_at
     where id = rec.id;

    inserted := inserted + 1;
  end loop;
  return inserted;
end;
$$;

-- Restrict to service-role and to a future pg_cron schedule. Authenticated
-- end-users must NOT be able to fire this directly.
revoke all on function public.materialize_recurring_expenses() from public;

-- pg_cron schedule (uncomment after `create extension pg_cron;`):
-- select cron.schedule(
--   'recurring-expenses-daily',
--   '0 6 * * *',          -- 06:00 UTC daily
--   $$ select public.materialize_recurring_expenses(); $$
-- );
