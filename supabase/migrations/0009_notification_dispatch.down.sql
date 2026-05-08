-- Down: 0009. Index dropped, column kept (PRD §10.2 — never drop user data).
drop index if exists idx_notifications_undispatched;
alter table notifications
  rename column dispatched_channels to _deprecated_dispatched_channels;
