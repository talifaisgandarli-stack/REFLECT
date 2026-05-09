-- @mention notification dispatch — REQ-TASK-07.
--
-- PRD: "Mention @userId format inside task_comments.body; mentions[] populated
-- server-side via parser; mentioned users notified (in-app + Telegram if linked)."
--
-- BEFORE INSERT trigger so we can stamp new.mentions[] on the same row.
-- Notification rows are inserted (in-app kind='mention'); the notify-fanout
-- cron (api/cron/notify-fanout.ts) handles Telegram delivery.

create or replace function public.task_comments_notify_mentions()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  raw_ids text[];
  mentioned_ids uuid[];
  uid uuid;
  actor uuid := auth.uid();
begin
  -- Extract @{uuid} patterns — format @xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  select array_agg(distinct m[1]::uuid)
  into mentioned_ids
  from regexp_matches(
    new.body,
    '@([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})',
    'gi'
  ) as t(m);

  -- Stamp mentions[] on the row (BEFORE trigger can mutate new.*)
  new.mentions := coalesce(mentioned_ids, array[]::uuid[]);

  -- Emit in-app notification for each mentioned user, skip self
  if mentioned_ids is not null then
    foreach uid in array mentioned_ids loop
      if uid is null or uid = actor then continue; end if;
      if not notif_enabled(uid, 'inapp', 'mention') then continue; end if;
      insert into notifications (user_id, kind, payload)
        values (
          uid,
          'mention',
          jsonb_build_object(
            'task_id',      new.task_id,
            'comment_id',   new.id,
            'from',         actor,
            'body_preview', left(new.body, 120)
          )
        );
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists task_comments_mentions on task_comments;
create trigger task_comments_mentions
  before insert on task_comments
  for each row execute function public.task_comments_notify_mentions();
