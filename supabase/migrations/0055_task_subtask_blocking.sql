-- PRD §REQ-TASK-05 / US-TASK-04 — parent cannot move to 'done' while any child
-- (linked via parent_task_id) is still open. The UI surfaces the
-- SubtaskBlockingModal; this trigger is the final guard so direct API writes
-- can't bypass the workflow.
--
-- Children are considered "open" when:
--   - their parent_task_id matches this task
--   - their status is NOT in ('done', 'cancelled')
--   - they aren't archived
--
-- Raised with errcode P0001 + msg 'task_has_open_children' so the client
-- hook isOpenChildrenError() can detect and open the blocker modal.

create or replace function public.tasks_block_done_with_open_children()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  open_count int;
begin
  -- Only intervene when target status is 'done' (cancelled deliberately allowed —
  -- a cancelled parent shouldn't drag children along)
  if new.status <> 'done' then
    return new;
  end if;

  -- On INSERT a brand-new task can't have children yet; skip.
  if tg_op = 'INSERT' then
    return new;
  end if;

  -- No-op if status didn't actually change to done
  if old.status = 'done' then
    return new;
  end if;

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

drop trigger if exists tasks_block_done_with_open_children on tasks;
create trigger tasks_block_done_with_open_children
  before update of status on tasks
  for each row execute function public.tasks_block_done_with_open_children();
