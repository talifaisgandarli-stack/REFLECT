-- RSVP notifications (PRD §M8.5 + §6.4).
-- When a calendar attendee responds via calendar_rsvp(), the event
-- organizer receives an in-app notification (kind='calendar_event_rsvp')
-- — but only on a *change* (initial pending → response, or status flip).
-- Self-RSVPs by the organizer are skipped to avoid noise.
--
-- The opt-out preference key is 'calendar_event_rsvp'; absence means
-- enabled (notif_enabled() default-true behaviour from 0007).

create or replace function public.calendar_rsvp(
  p_event_id uuid,
  p_status rsvp_status
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_event calendar_events%rowtype;
  v_prev rsvp_status;
  v_actor uuid := auth.uid();
begin
  select * into v_event from calendar_events where id = p_event_id;
  if not found then
    raise exception 'rsvp_event_missing' using errcode = '42704';
  end if;

  if not (
    v_actor = any(v_event.attendees)
    or is_admin()
    or v_event.organizer_id = v_actor
  ) then
    raise exception 'rsvp_not_attendee' using errcode = '42501';
  end if;

  select status into v_prev from calendar_rsvps
   where event_id = p_event_id and attendee_id = v_actor;

  insert into calendar_rsvps (event_id, attendee_id, status, responded_at)
  values (p_event_id, v_actor, p_status, now())
  on conflict (event_id, attendee_id)
    do update set status = excluded.status, responded_at = now();

  -- Notify the organizer when the response actually changes
  if v_event.organizer_id is not null
     and v_event.organizer_id <> v_actor
     and v_prev is distinct from p_status
     and notif_enabled(v_event.organizer_id, 'inapp', 'calendar_event_rsvp')
  then
    insert into notifications (user_id, kind, payload)
    values (
      v_event.organizer_id,
      'calendar_event_rsvp',
      jsonb_build_object(
        'event_id', v_event.id,
        'event_title', v_event.title,
        'starts_at', v_event.starts_at,
        'attendee_id', v_actor,
        'status', p_status::text,
        'previous_status', v_prev::text
      )
    );
  end if;
end;
$$;

revoke all on function public.calendar_rsvp(uuid, rsvp_status) from public;
grant execute on function public.calendar_rsvp(uuid, rsvp_status) to authenticated;
