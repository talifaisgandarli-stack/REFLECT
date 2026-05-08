drop index if exists idx_calendar_events_pending_invites;
alter table calendar_events drop column if exists invite_sent_at;
