drop trigger if exists trg_set_task_completion on public.tasks;
drop function if exists public.set_task_completion();
alter table public.tasks
  drop column if exists completed_at,
  drop column if exists completed_by;
