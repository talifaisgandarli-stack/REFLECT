-- PRD §REQ-TASK-07 — allow authors to edit/delete their own task_comments.
-- 0002_rls.sql added insert + update-own but no delete policy, which left the
-- comment list silently un-deletable for everyone (RLS denies by default).
--
-- Also add edited_at + deleted_at so the UI can render "(redaktə olunub)" and
-- preserve audit trail without hard-deleting comments. The activity_log keeps
-- the original create event; edit/delete events are stamped via triggers.

alter table public.task_comments
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz;

-- Stamp edited_at automatically on body change so the client doesn't have to.
create or replace function public.task_comments_stamp_edit()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.body is distinct from old.body then
    new.edited_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists task_comments_stamp_edit_trg on public.task_comments;
create trigger task_comments_stamp_edit_trg
  before update on public.task_comments
  for each row execute function public.task_comments_stamp_edit();

-- Delete-own policy (RLS denies by default). Admin keeps full reach via
-- existing is_admin() umbrella in tc_select; admins delete through a separate
-- policy so the audit trail clearly distinguishes owner-delete vs admin-delete.
drop policy if exists tc_delete_own on public.task_comments;
create policy tc_delete_own on public.task_comments
  for delete using (user_id = auth.uid());

drop policy if exists tc_delete_admin on public.task_comments;
create policy tc_delete_admin on public.task_comments
  for delete using (is_admin());
