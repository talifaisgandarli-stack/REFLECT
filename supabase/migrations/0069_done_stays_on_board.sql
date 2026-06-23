-- Tamamlandı should be a real, visible column: moving a task to 'done' no longer
-- auto-archives it (which had hidden it from the board and left the column at 0).
-- Only 'cancelled' auto-archives now (it has no board column → belongs in Arxiv).
-- Done tasks stay on the board; they are archived explicitly (bulk "Arxivlə" or the
-- Arxiv flow) when the user chooses. Supersedes the 0006 behaviour for REQ-TASK-08.
create or replace function public.tasks_auto_archive()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelled' then
    if new.archived_at is null then
      new.archived_at := now();
    end if;
  elsif tg_op = 'UPDATE'
        and old.status = 'cancelled'
        and new.status <> 'cancelled' then
    -- reopen from cancelled: clear the archive stamp
    new.archived_at := null;
  end if;
  return new;
end;
$$;

-- Bring previously auto-archived done tasks back onto the board so existing data
-- matches the new model. (Cancelled tasks stay archived.)
update tasks set archived_at = null where status = 'done' and archived_at is not null;
