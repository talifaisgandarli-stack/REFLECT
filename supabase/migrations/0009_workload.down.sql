drop view if exists team_workload_summary;
drop trigger if exists tasks_compute_workload on tasks;
drop function if exists public.tasks_compute_workload();
