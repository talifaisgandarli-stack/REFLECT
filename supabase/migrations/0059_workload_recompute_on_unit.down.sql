-- Revert to the original 0006 trigger (drop duration_unit from the column list).
drop trigger if exists tasks_workload on public.tasks;
create trigger tasks_workload
  before insert or update of estimated_duration, risk_buffer_pct
  on public.tasks
  for each row execute function public.tasks_recompute_workload();
