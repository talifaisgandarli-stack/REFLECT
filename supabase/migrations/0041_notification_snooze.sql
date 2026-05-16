-- 0041 — PRD §6.4 — let users snooze a notification for N hours instead of
-- mark-read-just-to-clear-the-badge.
--
-- Additive: nullable timestamptz column. NotificationBell filters out rows
-- where snoozed_until > now() so they reappear once the snooze expires.

alter table notifications
  add column if not exists snoozed_until timestamptz;

create index if not exists notifications_user_unread_snooze_idx
  on notifications (user_id, read_at, snoozed_until);
