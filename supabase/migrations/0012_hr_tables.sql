-- HR module tables (PRD §M8 8.2 Əmək Haqqı, 8.3 Performans, 8.4 Məzuniyyət).
-- All three tables are scoped: own-rows for users, full access for admins.

-- ---------------------------------------------------------------------------
-- 8.2 — Salaries: admin sees all, employees see own only
-- ---------------------------------------------------------------------------
create table if not exists salaries (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references profiles(id) on delete cascade,
  amount numeric not null check (amount > 0),
  currency text not null default 'AZN',
  effective_from date not null,
  effective_to date,
  components jsonb not null default '{}'::jsonb,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  constraint chk_salary_dates
    check (effective_to is null or effective_to >= effective_from)
);
create index if not exists idx_salaries_employee on salaries(employee_id, effective_from desc);

alter table salaries enable row level security;
create policy salaries_self_or_admin on salaries for select
  using (employee_id = auth.uid() or is_admin());
create policy salaries_admin_write on salaries for all
  using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- 8.4 — Leave requests: workflow + auto calendar event on approval
-- ---------------------------------------------------------------------------
create type leave_kind as enum ('annual', 'sick', 'unpaid', 'parental', 'other');
create type leave_status as enum ('pending', 'approved', 'denied', 'cancelled');

create table if not exists leave_requests (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references profiles(id) on delete cascade,
  kind leave_kind not null default 'annual',
  starts_at date not null,
  ends_at date not null,
  days int generated always as (
    greatest(1, (ends_at - starts_at) + 1)
  ) stored,
  status leave_status not null default 'pending',
  approver_id uuid references profiles(id),
  decided_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  constraint chk_leave_dates check (ends_at >= starts_at)
);
create index if not exists idx_leave_employee on leave_requests(employee_id, starts_at desc);

alter table leave_requests enable row level security;
create policy leave_self_select on leave_requests for select
  using (employee_id = auth.uid() or is_admin());
create policy leave_self_insert on leave_requests for insert
  with check (employee_id = auth.uid());
create policy leave_self_cancel on leave_requests for update
  using (employee_id = auth.uid() and status = 'pending')
  with check (employee_id = auth.uid() and status in ('pending', 'cancelled'));
create policy leave_admin_decide on leave_requests for update
  using (is_admin()) with check (is_admin());

-- Approve flow: stamps decided_at + creates a calendar_events row spanning
-- the leave window. Idempotent — re-approving is a no-op for the calendar.
create or replace function public.leave_decide(
  p_id uuid,
  p_status leave_status,
  p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  cur leave_requests%rowtype;
begin
  if not is_admin() then
    raise exception 'leave_decide_admin_only' using errcode = '42501';
  end if;
  if p_status not in ('approved', 'denied') then
    raise exception 'leave_decide_invalid_status';
  end if;

  select * into cur from leave_requests where id = p_id;
  if not found then raise exception 'leave_not_found'; end if;
  if cur.status <> 'pending' then
    raise exception 'leave_already_decided';
  end if;

  update leave_requests
     set status = p_status,
         approver_id = auth.uid(),
         decided_at = now(),
         note = coalesce(p_note, note)
   where id = p_id;

  if p_status = 'approved' then
    insert into calendar_events (
      title, starts_at, ends_at, all_day, attendees, organizer_id
    )
    select
      'Məzuniyyət — ' || coalesce(p.full_name, p.email),
      cur.starts_at::timestamptz,
      (cur.ends_at + 1)::timestamptz,
      true,
      array[cur.employee_id]::uuid[],
      cur.employee_id
    from profiles p
    where p.id = cur.employee_id;
  end if;
end;
$$;

revoke all on function public.leave_decide(uuid, leave_status, text) from public;
grant execute on function public.leave_decide(uuid, leave_status, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8.3 — Performance reviews: yearly gauges + ratings jsonb
-- ---------------------------------------------------------------------------
create table if not exists performance_reviews (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references profiles(id) on delete cascade,
  year int not null check (year between 2024 and 2100),
  score int check (score between 0 and 100),
  ratings jsonb not null default '{}'::jsonb,
  reviewer_id uuid references profiles(id),
  summary text,
  created_at timestamptz not null default now(),
  unique (employee_id, year)
);
create index if not exists idx_performance_employee on performance_reviews(employee_id, year desc);

alter table performance_reviews enable row level security;
create policy perf_self_or_admin on performance_reviews for select
  using (employee_id = auth.uid() or is_admin());
create policy perf_admin_write on performance_reviews for all
  using (is_admin()) with check (is_admin());
