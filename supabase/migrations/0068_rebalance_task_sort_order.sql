-- PRD §REQ-TASK-03 — fractional-index reorder (0062) collapses precision
-- after ~52 successive midsplits on the same slot. When two siblings
-- collapse to equal sort_order, the JS sort is unstable and the column
-- jumps around. We expose a rebalance RPC the client calls on detection
-- (|above - below| < 1) — assigns clean 1024-step values within the
-- (project_id, status) bucket.

create or replace function public.rebalance_task_sort_order(
  p_project_id uuid,
  p_status task_status
)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  affected int;
begin
  with ranked as (
    select id,
           row_number() over (
             order by coalesce(sort_order, 1e18), created_at, id
           ) as rn
      from public.tasks
     where archived_at is null
       and status = p_status
       and (
         (p_project_id is null and project_id is null)
         or project_id = p_project_id
       )
  )
  update public.tasks t
     set sort_order = ranked.rn * 1024.0
    from ranked
   where t.id = ranked.id;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

grant execute on function public.rebalance_task_sort_order(uuid, task_status) to authenticated;
