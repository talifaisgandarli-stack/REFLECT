drop trigger if exists salaries_activity on salaries;
drop trigger if exists expenses_activity on expenses;
drop trigger if exists incomes_activity on incomes;
drop function if exists public.salaries_activity_trg();
drop function if exists public.expenses_activity_trg();
drop function if exists public.incomes_activity_trg();
