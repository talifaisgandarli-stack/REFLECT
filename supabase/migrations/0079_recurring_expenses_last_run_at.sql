-- REQ-FIN-05 — surface "when did this rule last materialize?" in the Finance
-- "Sabit" tab, and give the cron a place to record it. Purely additive: a
-- nullable timestamp, NULL meaning "never run yet" (e.g. a freshly created rule).
--
-- The materializer (api/cron/recurring-expenses.ts) writes last_run_at = now()
-- whenever it inserts one or more expense rows for a rule. The UI reads it to
-- show last-run age and to flag overdue rules (next_run_at in the past), which
-- is the early-warning signal for a materialization backlog (cron down, or a
-- rule seeded with a far-past next_run_at).
alter table public.recurring_expenses
  add column if not exists last_run_at timestamptz;
