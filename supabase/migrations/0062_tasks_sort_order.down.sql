drop index if exists public.idx_tasks_status_sort;
alter table public.tasks drop column if exists sort_order;
