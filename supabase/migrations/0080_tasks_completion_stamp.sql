-- REQ-TASK / Done list — record a real completion timestamp and actor instead
-- of inferring "done at" from archived_at (which is only set on archival, so an
-- un-archived done task fell back to created_at — wrong). Additive + a BEFORE
-- UPDATE trigger that stamps on the open→done transition and clears on reopen.
alter table public.tasks
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by uuid references public.profiles(id) on delete set null;

create or replace function public.set_task_completion()
returns trigger language plpgsql as $$
begin
  if new.status = 'done' and old.status is distinct from 'done' then
    -- Stamp on entry to done; respect an explicit value if the caller set one.
    new.completed_at := coalesce(new.completed_at, now());
    new.completed_by := coalesce(new.completed_by, auth.uid());
  elsif new.status is distinct from 'done' and old.status = 'done' then
    -- Reopened — clear so a later re-completion re-stamps fresh.
    new.completed_at := null;
    new.completed_by := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_task_completion on public.tasks;
create trigger trg_set_task_completion
  before update on public.tasks
  for each row execute function public.set_task_completion();

-- Backfill historical done rows: best-effort completion time = archived_at,
-- else created_at. completed_by is unknowable retroactively, left null.
update public.tasks
  set completed_at = coalesce(archived_at, created_at)
  where status = 'done' and completed_at is null;
