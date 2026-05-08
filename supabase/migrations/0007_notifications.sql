-- Notifications fan-out (PRD §6.4, §10.4) — per-event, per-channel preferences
-- + DB triggers that emit `notifications` rows on assignee status changes.
-- Telegram + email dispatch is a serverless cron consumer (out of scope here).

-- ---------------------------------------------------------------------------
-- notification_preferences — user × channel × event matrix (PRD §10.4)
-- ---------------------------------------------------------------------------
create table if not exists notification_preferences (
  user_id uuid not null references profiles(id) on delete cascade,
  channel text not null check (channel in ('inapp', 'email', 'telegram')),
  event_kind text not null,
  enabled boolean not null default true,
  primary key (user_id, channel, event_kind)
);

alter table notification_preferences enable row level security;
create policy nprefs_self on notification_preferences for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Helper: was this notification kind enabled on `inapp` for the user?
-- Defaults to true when no row exists (opt-out model — PRD §6.4).
-- ---------------------------------------------------------------------------
create or replace function public.notif_enabled(
  p_user uuid,
  p_channel text,
  p_event text
) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select enabled from notification_preferences
       where user_id = p_user and channel = p_channel and event_kind = p_event),
    true
  );
$$;

-- ---------------------------------------------------------------------------
-- Task status change → notify assignees (excluding the actor)
-- Event kinds:
--   task_status_changed — generic move
--   task_done           — emitted in addition when status='done'
--   task_cancelled      — emitted in addition when status='cancelled'
-- ---------------------------------------------------------------------------
create or replace function public.tasks_notify_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
  actor uuid := auth.uid();
  payload jsonb;
begin
  if tg_op <> 'UPDATE' or new.status is not distinct from old.status then
    return new;
  end if;

  payload := jsonb_build_object(
    'task_id', new.id,
    'title', new.title,
    'project_id', new.project_id,
    'from', old.status,
    'to', new.status,
    'by', actor
  );

  foreach uid in array coalesce(new.assignee_ids, array[]::uuid[]) loop
    if uid is null or uid = actor then continue; end if;
    if not notif_enabled(uid, 'inapp', 'task_status_changed') then continue; end if;
    insert into notifications (user_id, kind, payload)
      values (uid, 'task_status_changed', payload);
    if new.status = 'done' and notif_enabled(uid, 'inapp', 'task_done') then
      insert into notifications (user_id, kind, payload)
        values (uid, 'task_done', payload);
    elsif new.status = 'cancelled' and notif_enabled(uid, 'inapp', 'task_cancelled') then
      insert into notifications (user_id, kind, payload)
        values (uid, 'task_cancelled', payload);
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists tasks_notify_status on tasks;
create trigger tasks_notify_status
  after update of status on tasks
  for each row execute function public.tasks_notify_status_change();

-- ---------------------------------------------------------------------------
-- Task assignment change → notify newly-added assignees
-- ---------------------------------------------------------------------------
create or replace function public.tasks_notify_new_assignee()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
  actor uuid := auth.uid();
  added uuid[];
begin
  if tg_op = 'INSERT' then
    added := coalesce(new.assignee_ids, array[]::uuid[]);
  elsif tg_op = 'UPDATE' then
    added := array(
      select x from unnest(coalesce(new.assignee_ids, array[]::uuid[])) x
       where x <> all (coalesce(old.assignee_ids, array[]::uuid[]))
    );
  else
    return new;
  end if;

  foreach uid in array added loop
    if uid is null or uid = actor then continue; end if;
    if not notif_enabled(uid, 'inapp', 'task_assigned') then continue; end if;
    insert into notifications (user_id, kind, payload)
      values (uid, 'task_assigned',
        jsonb_build_object(
          'task_id', new.id,
          'title', new.title,
          'deadline', new.deadline,
          'by', actor
        ));
  end loop;
  return new;
end;
$$;

drop trigger if exists tasks_notify_assignee on tasks;
create trigger tasks_notify_assignee
  after insert or update of assignee_ids on tasks
  for each row execute function public.tasks_notify_new_assignee();
