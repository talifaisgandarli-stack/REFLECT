-- Restore the 0058 function body (log_activity on every body change).

create or replace function public.task_comments_notify_mentions_on_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
  added uuid[];
begin
  if new.body is not distinct from old.body then
    return new;
  end if;

  perform log_activity('task_comment', new.task_id, 'comment_edited', null, null,
    jsonb_build_object('comment_id', new.id));

  if array_length(new.mentions, 1) is null then
    return new;
  end if;

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
