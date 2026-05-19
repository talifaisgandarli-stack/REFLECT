-- 0045 — PRD §8.2 — RFC 5545 EXDATE support for recurring calendar events.
-- Stores skipped occurrence dates (ISO date strings, no time) for events with
-- a recurrence_rule. UI checks this array when expanding a series; rendering
-- a single instance for editing/deleting an exception writes the date here.
--
-- Additive: nullable text[]; null = no exceptions.

alter table calendar_events
  add column if not exists exception_dates text[] not null default '{}';
