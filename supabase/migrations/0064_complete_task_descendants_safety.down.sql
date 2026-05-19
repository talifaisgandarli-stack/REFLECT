-- Revert to the pre-hardened body (no safety counter, no denied-rows abort).
-- Reapply the 0061 function definition.

create or replace function public.complete_task_descendants(p_root uuid)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  max_depth int;
  current_depth int;
  total_affected int := 0;
  loop_affected int := 0;
begin
  with recursive subtree as (
    select id, parent_task_id, 1 as depth
      from public.tasks
     where parent_task_id = p_root
       and status not in ('done', 'cancelled')
       and archived_at is null
    union all
    select t.id, t.parent_task_id, s.depth + 1
      from public.tasks t
      join subtree s on t.parent_task_id = s.id
     where t.status not in ('done', 'cancelled')
       and t.archived_at is null
  )
  select coalesce(max(depth), 0) into max_depth from subtree;

  current_depth := max_depth;
  while current_depth >= 1 loop
    with recursive subtree2 as (
      select id, parent_task_id, 1 as depth
        from public.tasks
       where parent_task_id = p_root
         and status not in ('done', 'cancelled')
         and archived_at is null
      union all
      select t.id, t.parent_task_id, s.depth + 1
        from public.tasks t
        join subtree2 s on t.parent_task_id = s.id
       where t.status not in ('done', 'cancelled')
         and t.archived_at is null
    )
    update public.tasks
       set status = 'done'
     where id in (select id from subtree2 where depth = current_depth);
    get diagnostics loop_affected = row_count;
    total_affected := total_affected + loop_affected;
    current_depth := current_depth - 1;
  end loop;

  update public.tasks
     set status = 'done'
   where id = p_root
     and status not in ('done', 'cancelled')
     and archived_at is null;
  get diagnostics loop_affected = row_count;
  total_affected := total_affected + loop_affected;

  return total_affected;
end;
$$;
