-- PRD §REQ-TASK-05 — harden complete_task_descendants (0061). If RLS UPDATE
-- silently denies a deep descendant, the prior while-loop kept seeing the
-- same row at the same depth forever and never progressed past it. We now
--   • detect "no rows updated but open descendants remain" and abort with
--     a typed error the client can surface to the user
--   • cap iterations with a safety counter so a malformed subtree can't
--     spin past max_depth × 2
-- Both replace the function body in place; signature/grant unchanged.

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
  iter_cap int;
  iter_count int := 0;
  remaining_open int;
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

  iter_cap := max_depth * 2 + 4; -- generous; real progress halves work each pass
  current_depth := max_depth;
  while current_depth >= 1 loop
    iter_count := iter_count + 1;
    if iter_count > iter_cap then
      raise exception 'complete_task_descendants_stuck'
        using errcode = 'P0001',
              detail = format('iter_cap=%s exceeded at depth=%s', iter_cap, current_depth);
    end if;

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

    -- If nothing moved but rows still exist at this depth, RLS or a trigger
    -- is rejecting the update silently. Abort so the caller doesn't get a
    -- false "all done" success.
    if loop_affected = 0 then
      select count(*) into remaining_open
        from public.tasks
       where parent_task_id is not null
         and status not in ('done', 'cancelled')
         and archived_at is null
         and id in (
           with recursive st as (
             select id from public.tasks
              where parent_task_id = p_root
                and status not in ('done', 'cancelled')
                and archived_at is null
             union all
             select t.id from public.tasks t
               join st on t.parent_task_id = st.id
              where t.status not in ('done', 'cancelled')
                and t.archived_at is null
           )
           select id from st
         );
      if remaining_open > 0 then
        raise exception 'complete_task_descendants_denied'
          using errcode = 'P0001',
                detail = format('%s descendant(s) could not be closed (RLS or trigger)', remaining_open);
      end if;
    end if;

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
