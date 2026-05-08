-- Down: 0007 notifications fan-out.
-- Existing notifications table is preserved (PRD §10.2 — never drop).

drop trigger if exists tasks_notify_status on tasks;
drop trigger if exists tasks_notify_assignee on tasks;

drop function if exists public.tasks_notify_status_change();
drop function if exists public.tasks_notify_new_assignee();
drop function if exists public.notif_enabled(uuid, text, text);

-- Rename rather than drop, per §10.2.
alter table if exists notification_preferences
  rename to _archived_notification_preferences_2026;
