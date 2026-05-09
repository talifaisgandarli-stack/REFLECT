-- Migration 0010 — Module 8/9 PRD-mandated tables.
-- Tables enumerated in PRD §3.2 / §8 / §9 but not in 0001 init schema:
--   salaries (PRD §8.2), leave_requests (§8.4), career_levels (§9.2),
--   content_plans (§9.3), performance_reviews (§8.3).
-- All RLS-enabled per §9.1 (mandatory from day one).

-- ----------------------------------------------------------------------------
-- §8.2 Salary
-- ----------------------------------------------------------------------------
create table if not exists salaries (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references profiles(id) on delete cascade,
  amount numeric not null check (amount > 0),
  currency text not null default 'AZN',
  effective_from date not null,
  effective_to date,
  components jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists idx_salaries_employee on salaries(employee_id);

alter table salaries enable row level security;
create policy sal_self on salaries for select
  using (employee_id = auth.uid() or is_admin());
create policy sal_admin on salaries for all
  using (is_admin()) with check (is_admin());

-- ----------------------------------------------------------------------------
-- §8.3 Performance reviews (yearly gauges)
-- ----------------------------------------------------------------------------
create table if not exists performance_reviews (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references profiles(id) on delete cascade,
  year int not null check (year >= 2026),
  score int not null check (score between 0 and 100),
  ratings jsonb not null default '{}',
  reviewer_id uuid references profiles(id),
  summary text,
  created_at timestamptz not null default now(),
  unique (employee_id, year)
);
create index if not exists idx_perf_employee on performance_reviews(employee_id);

alter table performance_reviews enable row level security;
create policy perf_self on performance_reviews for select
  using (employee_id = auth.uid() or is_admin());
create policy perf_admin on performance_reviews for all
  using (is_admin()) with check (is_admin());

-- ----------------------------------------------------------------------------
-- §8.4 Leave requests
-- ----------------------------------------------------------------------------
create type leave_kind as enum ('annual', 'sick', 'unpaid', 'other');
create type leave_status as enum ('pending', 'approved', 'denied', 'cancelled');

create table if not exists leave_requests (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references profiles(id) on delete cascade,
  kind leave_kind not null default 'annual',
  starts_at date not null,
  ends_at date not null,
  days int not null check (days > 0),
  status leave_status not null default 'pending',
  approver_id uuid references profiles(id),
  note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  check (ends_at >= starts_at)
);
create index if not exists idx_leave_employee on leave_requests(employee_id);
create index if not exists idx_leave_status on leave_requests(status);

alter table leave_requests enable row level security;
create policy leave_select on leave_requests for select
  using (employee_id = auth.uid() or is_admin());
create policy leave_insert_self on leave_requests for insert
  with check (employee_id = auth.uid());
create policy leave_admin_update on leave_requests for update
  using (is_admin()) with check (is_admin());

-- ----------------------------------------------------------------------------
-- §9.2 Career levels
-- ----------------------------------------------------------------------------
create table if not exists career_levels (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  level_index int not null unique,
  requirements jsonb not null default '[]',
  description text,
  created_at timestamptz not null default now()
);

alter table career_levels enable row level security;
create policy cl_select on career_levels for select using (auth.role() = 'authenticated');
create policy cl_admin on career_levels for all using (is_admin()) with check (is_admin());

-- Seed levels (PRD §9.2 — 4 levels described in stub)
insert into career_levels (name, level_index, description, requirements) values
  ('Junior', 1, 'Yeni qoşulanlar, mentor altında', '["Mentor altında işləmək","Əsas alətlərdə bacarıq"]'),
  ('Mid', 2, 'Müstəqil layihə paketləri', '["Müstəqil paket idarəsi","Müştəri ilə birbaşa ünsiyyət"]'),
  ('Senior', 3, 'Layihə rəhbərliyi, ekspertiza', '["Layihə rəhbərliyi","Ekspertiza alt-tapşırıqları"]'),
  ('Principal', 4, 'Strateji qərarlar, müştəri əlaqələri', '["Strateji qərar","Mentorluq","Müştəri portfeli"]')
on conflict (level_index) do nothing;

-- ----------------------------------------------------------------------------
-- §9.3 Content plans
-- ----------------------------------------------------------------------------
create type content_status as enum ('idea', 'draft', 'review', 'published');

create table if not exists content_plans (
  id uuid primary key default uuid_generate_v4(),
  channel text,
  scheduled_at timestamptz,
  topic text not null,
  owner_id uuid references profiles(id),
  status content_status not null default 'idea',
  body text,
  created_at timestamptz not null default now()
);
create index if not exists idx_content_status on content_plans(status);

alter table content_plans enable row level security;
create policy cp_admin on content_plans for all using (is_admin()) with check (is_admin());

-- ----------------------------------------------------------------------------
-- Activity log triggers for new tables (PRD §6.1)
-- ----------------------------------------------------------------------------
create or replace function public.simple_log_trg()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ent text := tg_argv[0];
begin
  if tg_op = 'INSERT' then
    perform log_activity(ent, new.id, 'created', null, null, to_jsonb(new));
  elsif tg_op = 'UPDATE' then
    perform log_activity(ent, new.id, 'updated', null, to_jsonb(old), to_jsonb(new));
  elsif tg_op = 'DELETE' then
    perform log_activity(ent, old.id, 'deleted', null, to_jsonb(old), null);
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_salaries_log on salaries;
create trigger trg_salaries_log after insert or update or delete on salaries
  for each row execute function simple_log_trg('salary');

drop trigger if exists trg_leave_log on leave_requests;
create trigger trg_leave_log after insert or update or delete on leave_requests
  for each row execute function simple_log_trg('leave_request');

drop trigger if exists trg_content_log on content_plans;
create trigger trg_content_log after insert or update or delete on content_plans
  for each row execute function simple_log_trg('content_plan');
