-- PRD §16 (security audit) — activity_log SELECT was open to all authenticated
-- users. The new_value jsonb on income/expense/salary/receivable rows can
-- contain monetary deltas, vendor names, and category breakdowns that
-- non-admins MUST NOT see (RLS on the source tables already enforces this).
--
-- Tighten: non-admins can read activity for non-financial entities only.
-- Admins (is_admin() = true) keep full visibility for the dashboard feed.

drop policy if exists al_select on activity_log;

create policy al_select on activity_log
  for select using (
    is_admin()
    or entity_type not in ('incomes', 'expenses', 'salaries', 'receivables', 'recurring_expenses')
  );

-- INSERT policy unchanged: triggers run with the calling user's authority,
-- and write paths to financial tables are themselves admin-gated by RLS.
