-- §11.1 Timesheet/day log + §12.1 "day-level only".
-- Schema decision (logged per prd-guard rule 5, user-approved 2026-05-08):
-- minimal day-level table — no per-task time tracking by §12.1.
-- PRD §3.2 should be amended to include this table.

create table if not exists day_logs (
  id          uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references profiles(id) on delete cascade,
  day         date not null,
  hours       numeric not null check (hours >= 0 and hours <= 24),
  project_id  uuid references projects(id) on delete set null,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (employee_id, day)
);
create index if not exists idx_day_logs_employee_day on day_logs(employee_id, day desc);

alter table day_logs enable row level security;
create policy dl_select on day_logs for select
  using (is_admin() or auth.uid() = employee_id);
create policy dl_self_write on day_logs for all
  using (auth.uid() = employee_id) with check (auth.uid() = employee_id);
create policy dl_admin_write on day_logs for all
  using (is_admin()) with check (is_admin());

-- updated_at touch.
create or replace function public.day_logs_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists day_logs_touch on day_logs;
create trigger day_logs_touch
  before update on day_logs
  for each row execute function public.day_logs_touch();
