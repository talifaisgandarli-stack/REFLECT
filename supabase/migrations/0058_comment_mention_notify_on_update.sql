-- PRD §REQ-TASK-07 — when an author edits a comment to add new @mentions,
-- those users must be notified just like fresh comments. 0004 only fired on
-- INSERT, so post-publish edits silently dropped notifications. This trigger
-- replays the fan-out for the diff (mentions added by the edit only), so we
-- don't re-spam users who were already notified on the original insert.

create or replace function public.task_comments_notify_mentions_on_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
  added uuid[];
begin
  -- Only fire when body changed; mentions[] is recomputed by the existing
  -- parse_task_comment_mentions BEFORE trigger.
  if new.body is not distinct from old.body then
    return new;
  end if;

  -- Log the edit so the activity feed reflects the revision.
  perform log_activity('task_comment', new.task_id, 'comment_edited', null, null,
    jsonb_build_object('comment_id', new.id));

  if array_length(new.mentions, 1) is null then
    return new;
  end if;

  -- Set difference: mentions in NEW but not OLD. Avoids re-notifying users
  -- who were already pinged on the original insert.
  select coalesce(array_agg(m), array[]::uuid[])
    into added
    from unnest(new.mentions) m
   where m <> all(coalesce(old.mentions, array[]::uuid[]));

  if array_length(added, 1) is null then
    return new;
  end if;

  foreach uid in array added loop
    if uid <> new.user_id then
      insert into notifications (user_id, kind, payload)
      values (uid, 'mention',
        jsonb_build_object('task_id', new.task_id, 'comment_id', new.id, 'by', new.user_id, 'edited', true));
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists task_comments_notify_update on public.task_comments;
create trigger task_comments_notify_update
  after update of body on public.task_comments
  for each row execute function public.task_comments_notify_mentions_on_update();
