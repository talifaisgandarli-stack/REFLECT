-- N15 — the dashboard workload widget (US-DASH-05) fetched up to 500 open-task
-- rows and counted them client-side, silently under-reporting once a firm has
-- more than 500 open tasks. Aggregate server-side instead: one row per assignee
-- with their open-task count. security invoker keeps the same task visibility
-- the client query already relied on (RLS unchanged).

create or replace function public.open_task_counts()
returns table(user_id uuid, open_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select a.user_id, count(*)::bigint as open_count
  from public.tasks t
  cross join lateral unnest(t.assignee_ids) as a(user_id)
  where t.archived_at is null
    and t.status not in ('done', 'cancelled')
  group by a.user_id
$$;

grant execute on function public.open_task_counts() to authenticated;
