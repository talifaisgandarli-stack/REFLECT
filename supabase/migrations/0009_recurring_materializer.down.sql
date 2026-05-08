-- If pg_cron schedule was registered, the operator must drop it manually:
--   select cron.unschedule('recurring-expenses-daily');

drop function if exists public.materialize_recurring_expenses();
drop index if exists expenses_recurring_unique;
