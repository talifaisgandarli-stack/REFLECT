drop policy if exists tc_delete_admin on public.task_comments;
drop policy if exists tc_delete_own on public.task_comments;
drop trigger if exists task_comments_stamp_edit_trg on public.task_comments;
drop function if exists public.task_comments_stamp_edit();
alter table public.task_comments
  drop column if exists edited_at,
  drop column if exists deleted_at;
