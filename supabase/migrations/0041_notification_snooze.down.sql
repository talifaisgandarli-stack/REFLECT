-- 0041 down — PRD §10.2: rename, never drop.

drop index if exists notifications_user_unread_snooze_idx;

alter table notifications
  rename column snoozed_until to _deprecated_snoozed_until;
