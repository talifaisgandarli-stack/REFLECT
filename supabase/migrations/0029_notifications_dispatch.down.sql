drop index if exists idx_notifications_pending;
alter table notifications drop column if exists dispatched_at;
