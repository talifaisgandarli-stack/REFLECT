-- Notifications reliability (audit 2026-07): two fixes.
--
-- 1. In-app mention preference was ignored: the mention trigger inserted a
--    'mention' notification unconditionally, unlike the task_* triggers which
--    gate on notif_enabled(uid,'inapp',kind). Honour the preference.
-- 2. Cross-device DELETE/snooze-clear didn't propagate over realtime: the
--    client subscribes with user_id=eq.<uid>, but a DELETE only carries the PK
--    in `old` unless the table has REPLICA IDENTITY FULL — so the filter never
--    matched deletes and other devices kept showing removed rows until refetch.

-- 1. Gate the mention notification on the recipient's in-app preference.
create or replace function public.task_comments_notify_mentions()
returns trigger language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  perform log_activity('task_comment', new.task_id, 'commented', null, null,
    jsonb_build_object('mentions', new.mentions));
  if array_length(new.mentions, 1) is null then
    return new;
  end if;
  foreach uid in array new.mentions loop
    if uid <> new.user_id and notif_enabled(uid, 'inapp', 'mention') then
      insert into notifications (user_id, kind, payload)
      values (uid, 'mention',
        jsonb_build_object('task_id', new.task_id, 'comment_id', new.id, 'by', new.user_id));
    end if;
  end loop;
  return new;
end;
$$;

-- 2. Ship the full old row on DELETE so realtime's user_id filter matches and
--    deletes/snooze-clears propagate to the user's other devices.
alter table notifications replica identity full;
