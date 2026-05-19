-- PRD §REQ-TASK-05 / US-TASK-04 — "Hamısını tamamla" must close the entire
-- subtree atomically. The previous client implementation issued a single
-- `update tasks set status='done' where parent_task_id = X` which is non-
-- recursive: if a grandchild was open, the DB block-trigger fired half-way
-- through the batch and the update stayed partial.
--
-- This RPC walks the descendant tree bottom-up so each leaf is closed before
-- its parent, all inside one transaction. Permission: SECURITY INVOKER so
-- RLS UPDATE policies apply (assignee or admin per 0002_rls.sql).

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
  -- Determine the depth of the deepest open descendant so we can close
  -- layer-by-layer from leaves upward; the block-trigger on parent done
  -- transitions only passes when all children are already done.
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

  -- Close the root itself; the block-trigger now passes because every
  -- descendant has been closed by the loop above.
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

grant execute on function public.complete_task_descendants(uuid) to authenticated;
