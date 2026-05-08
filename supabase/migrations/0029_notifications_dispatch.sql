-- §6.4 — notifications dispatcher needs to know which rows are still
-- pending. notifications already exists per §3.2; we only add dispatched_at
-- + a partial index on the pending set.

alter table notifications
  add column if not exists dispatched_at timestamptz;

-- Partial index keeps lookups for the cron O(pending) regardless of total
-- notification count.
create index if not exists idx_notifications_pending
  on notifications(created_at)
  where dispatched_at is null;
