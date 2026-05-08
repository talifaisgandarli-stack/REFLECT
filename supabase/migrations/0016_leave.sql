-- PRD §3.2 / §8.4 / US-LEAVE-01..02 — close the schema gap: leave_requests
-- table was canonical in PRD §3.2 but missing from 0001.

create type leave_kind as enum ('annual', 'sick', 'unpaid', 'parental', 'other');
create type leave_status as enum ('pending', 'approved', 'denied', 'cancelled');

create table if not exists leave_requests (
  id            uuid primary key default uuid_generate_v4(),
  employee_id   uuid not null references profiles(id) on delete cascade,
  kind          leave_kind not null,
  starts_at     date not null,
  ends_at       date not null,
  days          numeric not null check (days > 0),
  status        leave_status not null default 'pending',
  approver_id   uuid references profiles(id),
  approved_at   timestamptz,
  calendar_event_id uuid references calendar_events(id) on delete set null,
  note          text,
  created_at    timestamptz not null default now(),
  check (ends_at >= starts_at)
);
create index if not exists idx_leave_employee on leave_requests(employee_id, starts_at desc);
create index if not exists idx_leave_status on leave_requests(status);

alter table leave_requests enable row level security;
create policy leave_select on leave_requests for select
  using (is_admin() or auth.uid() = employee_id);
create policy leave_self_insert on leave_requests for insert
  with check (auth.uid() = employee_id and status = 'pending');
create policy leave_self_cancel on leave_requests for update
  using (auth.uid() = employee_id and status = 'pending')
  with check (auth.uid() = employee_id and status in ('pending', 'cancelled'));
create policy leave_admin_write on leave_requests for all
  using (is_admin()) with check (is_admin());

-- US-LEAVE-02: admin decision RPC. Stamps approver_id + approved_at;
-- on approve, auto-creates a calendar_events row (kind='leave') and emits
-- an in-app notification to the requester.
create or replace function public.decide_leave(
  p_request_id uuid,
  p_decision   text  -- 'approved' | 'denied'
)
returns leave_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row leave_requests;
  v_event_id uuid;
  v_employee profiles%rowtype;
begin
  if not public.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'denied') then
    raise exception 'bad_decision' using errcode = 'P0001';
  end if;

  select * into v_row from leave_requests where id = p_request_id for update;
  if not found then
    raise exception 'leave_not_found' using errcode = 'P0002';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'not_pending' using errcode = 'P0001';
  end if;

  if p_decision = 'approved' then
    select * into v_employee from profiles where id = v_row.employee_id;

    insert into calendar_events (title, starts_at, ends_at, all_day, attendees, organizer_id)
      values (
        'Məzuniyyət — ' || coalesce(v_employee.full_name, v_employee.email),
        v_row.starts_at::timestamptz,
        (v_row.ends_at + 1)::timestamptz,
        true,
        array[v_row.employee_id],
        auth.uid()
      )
      returning id into v_event_id;
  end if;

  update leave_requests
     set status = p_decision::leave_status,
         approver_id = auth.uid(),
         approved_at = now(),
         calendar_event_id = v_event_id
   where id = p_request_id
   returning * into v_row;

  insert into notifications (user_id, kind, payload)
    values (
      v_row.employee_id,
      'leave_' || p_decision,
      jsonb_build_object(
        'leave_id', v_row.id,
        'starts_at', v_row.starts_at,
        'ends_at', v_row.ends_at,
        'kind', v_row.kind
      )
    );

  return v_row;
end;
$$;

grant execute on function public.decide_leave(uuid, text) to authenticated;
