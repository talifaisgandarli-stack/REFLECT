-- Mention notification fixes (PRD §6.4 + REQ-TASK-07).
--
-- The existing 0004 trigger already inserts notifications row by row for
-- every @<uuid> mention parsed from a task_comments body. Two gaps:
--
-- 1. The opt-out preference matrix is bypassed: a user who turned
--    notif_enabled(_, 'inapp', 'mention') = false still receives mentions.
-- 2. The notification payload only carries task_id + comment_id, so the
--    bell renders a fallback "Tapşırıq #<short-id>" line instead of the
--    actual task title.
--
-- This migration replaces the function (CREATE OR REPLACE keeps the
-- trigger binding) so both holes close. The down() restores the 0004
-- behaviour byte-for-byte.

create or replace function public.task_comments_notify_mentions()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
  v_title text;
begin
  perform log_activity('task_comment', new.task_id, 'commented', null, null,
    jsonb_build_object('mentions', new.mentions));
  if array_length(new.mentions, 1) is null then
    return new;
  end if;
  select title into v_title from tasks where id = new.task_id;

  foreach uid in array new.mentions loop
    if uid = new.user_id then continue; end if;
    if not notif_enabled(uid, 'inapp', 'mention') then continue; end if;
    insert into notifications (user_id, kind, payload)
    values (
      uid,
      'mention',
      jsonb_build_object(
        'task_id', new.task_id,
        'title', v_title,
        'comment_id', new.id,
        'by', new.user_id
      )
    );
  end loop;
  return new;
end;
$$;
