alter table public.recurring_expenses
  drop column if exists last_run_at;
