-- Down: 0006 task lifecycle triggers.
-- Functions kept (cheap; PRD §10.2 favors rename-not-drop) but detached.

drop trigger if exists tasks_cancel_reason_required on tasks;
drop trigger if exists tasks_workload on tasks;
drop trigger if exists tasks_auto_archive on tasks;

drop function if exists public.tasks_cancel_reason_required();
drop function if exists public.tasks_recompute_workload();
drop function if exists public.tasks_auto_archive();
