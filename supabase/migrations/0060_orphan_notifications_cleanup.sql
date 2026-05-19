-- PRD §REQ-TASK-07 — when an author deletes their comment, any notifications
-- with `payload.comment_id = <deleted-id>` become orphans. The notification
-- bell still surfaces them and the deep-link breaks. Since `notifications` has
-- no FK to `task_comments` (payload is jsonb), we add an AFTER DELETE trigger
-- on task_comments that wipes its matching mention notifications.
--
-- Conservative scope: only delete `mention` kind with payload->>'comment_id'
-- matching the deleted row. Other notification kinds (task_assigned, etc.)
-- never reference comment_id, so they are untouched.

create or replace function public.task_comments_cleanup_notifications()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.notifications n
   where n.kind = 'mention'
     and (n.payload ->> 'comment_id')::uuid = old.id;
  return old;
end;
$$;

drop trigger if exists task_comments_cleanup_notifications_trg on public.task_comments;
create trigger task_comments_cleanup_notifications_trg
  after delete on public.task_comments
  for each row execute function public.task_comments_cleanup_notifications();
