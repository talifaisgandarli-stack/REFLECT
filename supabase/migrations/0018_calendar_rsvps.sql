-- Calendar RSVP responses (PRD §M8.5).
-- Each (event_id, attendee_id) pair has one row recording accept/decline/
-- maybe. Anyone listed in calendar_events.attendees may respond for
-- themselves; admins (or the organizer) may read everyone's responses.

create type rsvp_status as enum ('pending', 'yes', 'no', 'maybe');

create table if not exists calendar_rsvps (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references calendar_events(id) on delete cascade,
  attendee_id uuid not null references profiles(id) on delete cascade,
  status rsvp_status not null default 'pending',
  responded_at timestamptz,
  unique (event_id, attendee_id)
);
create index if not exists idx_calendar_rsvps_event
  on calendar_rsvps(event_id);

alter table calendar_rsvps enable row level security;

-- Read: admin OR the responder OR the event organizer
create policy rsvp_select on calendar_rsvps for select
  using (
    is_admin()
    or attendee_id = auth.uid()
    or exists (
      select 1 from calendar_events e
       where e.id = event_id and e.organizer_id = auth.uid()
    )
  );

-- Insert / update: the attendee responding to their own line. Admin can
-- backfill on behalf of someone (covers the organizer needing to reset
-- responses).
create policy rsvp_self_insert on calendar_rsvps for insert
  with check (attendee_id = auth.uid() or is_admin());
create policy rsvp_self_update on calendar_rsvps for update
  using (attendee_id = auth.uid() or is_admin())
  with check (attendee_id = auth.uid() or is_admin());

-- Convenience RPC: upsert an RSVP for the calling user, stamping responded_at.
create or replace function public.calendar_rsvp(
  p_event_id uuid,
  p_status rsvp_status
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from calendar_events e
     where e.id = p_event_id
       and (auth.uid() = any(e.attendees) or is_admin() or e.organizer_id = auth.uid())
  ) then
    raise exception 'rsvp_not_attendee' using errcode = '42501';
  end if;
  insert into calendar_rsvps (event_id, attendee_id, status, responded_at)
  values (p_event_id, auth.uid(), p_status, now())
  on conflict (event_id, attendee_id)
    do update set status = excluded.status, responded_at = now();
end;
$$;

revoke all on function public.calendar_rsvp(uuid, rsvp_status) from public;
grant execute on function public.calendar_rsvp(uuid, rsvp_status) to authenticated;
