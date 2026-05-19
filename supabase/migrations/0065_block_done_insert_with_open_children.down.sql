-- Revert to the 0055 trigger body (INSERT bypass restored).

create or replace function public.tasks_block_done_with_open_children()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  open_count int;
begin
  if new.status <> 'done' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    return new;
  end if;
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

drop trigger if exists tasks_block_done_with_open_children on public.tasks;
create trigger tasks_block_done_with_open_children
  before update of status on public.tasks
  for each row execute function public.tasks_block_done_with_open_children();
