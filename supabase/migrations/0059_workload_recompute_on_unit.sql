-- PRD §REQ-TASK-06 — workload formula is `estimated_duration × (1+risk%/100)`,
-- but the unit (hours/days) determines how downstream consumers interpret it.
-- Migration 0006 only fired the recompute trigger on changes to
-- `estimated_duration` and `risk_buffer_pct`, so switching unit hours→days
-- left `workload_calculated_at` stale and any caller that depends on
-- "workload last refreshed" got an outdated timestamp.
--
-- Fix: extend the trigger column list to include `duration_unit`. The math
-- itself is invariant (value × factor) but the timestamp bumps so cache
-- consumers re-fetch and the activity-log diff shows the change.

drop trigger if exists tasks_workload on public.tasks;
create trigger tasks_workload
  before insert or update of estimated_duration, risk_buffer_pct, duration_unit
  on public.tasks
  for each row execute function public.tasks_recompute_workload();
