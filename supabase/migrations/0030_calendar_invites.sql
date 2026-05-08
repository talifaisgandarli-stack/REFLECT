-- US-CAL-01 — external attendees receive an .ics email invite.
-- Track dispatch with invite_sent_at to keep the cron idempotent.

alter table calendar_events
  add column if not exists invite_sent_at timestamptz;

create index if not exists idx_calendar_events_pending_invites
  on calendar_events(starts_at)
  where invite_sent_at is null
    and array_length(external_emails, 1) > 0;
