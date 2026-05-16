-- 0045 down — PRD §10.2: rename, never drop.

alter table calendar_events
  rename column exception_dates to _deprecated_exception_dates;
