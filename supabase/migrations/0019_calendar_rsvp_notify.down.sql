-- Restore the pre-notification calendar_rsvp() body from 0018.
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
