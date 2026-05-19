-- PRD §6.1 — activity_log should reflect *meaningful* changes. Migration 0058
-- logged a `comment_edited` entry on every body change, which means every
-- typo fix produced an audit row. With active editors this blows up the
-- activity_log volume.
--
-- Fix: only log when mentions[] changed (added or removed). Notification
-- fanout already targets only the added users; logging mirrors that scope.
-- Pure text edits remain silent — the comment row's own edited_at stamp is
-- enough audit trail for "user X edited their own message".

create or replace function public.task_comments_notify_mentions_on_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
  added uuid[];
  removed uuid[];
  mentions_changed boolean;
begin
  if new.body is not distinct from old.body then
    return new;
  end if;

  select coalesce(array_agg(m), array[]::uuid[])
    into added
    from unnest(coalesce(new.mentions, array[]::uuid[])) m
   where m <> all(coalesce(old.mentions, array[]::uuid[]));

  select coalesce(array_agg(m), array[]::uuid[])
    into removed
    from unnest(coalesce(old.mentions, array[]::uuid[])) m
   where m <> all(coalesce(new.mentions, array[]::uuid[]));

  mentions_changed := array_length(added, 1) is not null
                   or array_length(removed, 1) is not null;

  if mentions_changed then
    perform log_activity('task_comment', new.task_id, 'comment_mention_updated', null, null,
      jsonb_build_object('comment_id', new.id, 'added', added, 'removed', removed));
  end if;

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
