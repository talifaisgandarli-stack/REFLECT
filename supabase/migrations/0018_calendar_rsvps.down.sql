drop function if exists public.calendar_rsvp(uuid, rsvp_status);
alter table if exists calendar_rsvps rename to _archived_calendar_rsvps_2026;
drop type if exists rsvp_status;
