-- Notification dispatch tracking — PRD §6.4 + §8.1.
-- Adds dispatched_channels jsonb so the /api/cron/notify-fanout consumer
-- can pick up only un-dispatched rows and stamp progress idempotently.

alter table notifications
  add column if not exists dispatched_channels jsonb not null default '{}'::jsonb;

-- Lookup index: outstanding rows have an empty {} object.
create index if not exists idx_notifications_undispatched
  on notifications (created_at desc)
  where dispatched_channels = '{}'::jsonb;
