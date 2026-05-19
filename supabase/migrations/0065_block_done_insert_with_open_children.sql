-- PRD §REQ-TASK-05 — close the INSERT bypass in 0055. The original trigger
-- early-exited on tg_op='INSERT' with the comment "a brand-new task can't
-- have children yet", but a row can be INSERT-ed with status='done' AND
-- parent_task_id pointing to an existing parent that already has open
-- siblings — or an INSERT can land at depth N+1 with status='done' while
-- its grandchildren at N+2 are still open. The block-trigger has to fire
-- on INSERT too so the invariant holds for direct API writes.

create or replace function public.tasks_block_done_with_open_children()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  open_count int;
begin
  -- Only intervene when target status is 'done' (cancelled stays allowed —
  -- a cancelled parent shouldn't drag children along)
  if new.status <> 'done' then
    return new;
  end if;

  -- On UPDATE, skip if status didn't actually change to done
  if tg_op = 'UPDATE' and old.status = 'done' then
    return new;
  end if;

  -- Check open descendants regardless of INSERT vs UPDATE. A brand-new
  -- INSERT can still have children if the caller created them first or if
  -- it lands on a parent_task_id that already has open siblings.
  select count(*) into open_count
  from public.tasks
  where parent_task_id = new.id
    and status not in ('done', 'cancelled')
    and archived_at is null;

  if open_count > 0 then
    raise exception 'task_has_open_children'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- Recreate trigger to also fire on INSERT.
drop trigger if exists tasks_block_done_with_open_children on public.tasks;
create trigger tasks_block_done_with_open_children
  before insert or update of status on public.tasks
  for each row execute function public.tasks_block_done_with_open_children();
