-- Restore the 0004 mention fan-out (no preference gate, no title in payload).
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
    if uid <> new.user_id then
      insert into notifications (user_id, kind, payload)
      values (uid, 'mention',
        jsonb_build_object('task_id', new.task_id, 'comment_id', new.id, 'by', new.user_id));
    end if;
  end loop;
  return new;
end;
$$;
