-- Team module schema — PRD §8.2 / §8.3 / §8.4 / §9.2 / §9.3.
--
-- These tables were enumerated in PRD §3.2 / §8 but not landed in 0001.
-- Adding them with the exact column shape from the PRD; RLS follows the
-- "user sees own / admin sees all" rule documented per section.

-- ----------------------------------------------------------------------------
-- 8.2 Əmək Haqqı
-- ----------------------------------------------------------------------------
create table if not exists salaries (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references profiles(id) on delete cascade,
  amount numeric not null check (amount > 0),
  currency text not null default 'AZN',
  effective_from date not null,
  effective_to date,
  components jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table salaries enable row level security;
create policy salaries_self on salaries for select
  using (employee_id = auth.uid() or is_admin());
create policy salaries_admin_write on salaries for all
  using (is_admin()) with check (is_admin());

-- ----------------------------------------------------------------------------
-- 8.3 Performans
-- ----------------------------------------------------------------------------
create table if not exists performance_reviews (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references profiles(id) on delete cascade,
  year int not null check (year >= 2026),
  score int check (score between 0 and 100),
  ratings jsonb not null default '{}'::jsonb,
  reviewer_id uuid references profiles(id),
  summary text,
  created_at timestamptz not null default now(),
  unique (employee_id, year)
);

alter table performance_reviews enable row level security;
create policy perf_self on performance_reviews for select
  using (employee_id = auth.uid() or is_admin());
create policy perf_admin_write on performance_reviews for all
  using (is_admin()) with check (is_admin());

-- ----------------------------------------------------------------------------
-- 8.4 Məzuniyyət
-- ----------------------------------------------------------------------------
create type leave_kind as enum ('annual', 'sick', 'unpaid', 'other');
create type leave_status as enum ('pending', 'approved', 'denied', 'cancelled');

create table if not exists leave_requests (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references profiles(id) on delete cascade,
  kind leave_kind not null default 'annual',
  starts_at date not null,
  ends_at date not null,
  days numeric not null check (days > 0),
  status leave_status not null default 'pending',
  approver_id uuid references profiles(id),
  note text,
  created_at timestamptz not null default now(),
  check (ends_at >= starts_at)
);

alter table leave_requests enable row level security;
create policy lr_select on leave_requests for select
  using (employee_id = auth.uid() or is_admin());
create policy lr_self_insert on leave_requests for insert
  with check (employee_id = auth.uid());
create policy lr_admin_write on leave_requests for update
  using (is_admin()) with check (is_admin());

-- ----------------------------------------------------------------------------
-- 9.2 Karyera Strukturu
-- ----------------------------------------------------------------------------
create table if not exists career_levels (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  level_index int not null unique,
  requirements jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table career_levels enable row level security;
create policy cl_select on career_levels for select
  using (auth.role() = 'authenticated');
create policy cl_admin_write on career_levels for all
  using (is_admin()) with check (is_admin());

-- ----------------------------------------------------------------------------
-- 9.3 Məzmun Planlaması
-- ----------------------------------------------------------------------------
create table if not exists content_plans (
  id uuid primary key default uuid_generate_v4(),
  channel text not null,
  scheduled_at timestamptz not null,
  topic text not null,
  owner_id uuid references profiles(id),
  status text not null default 'draft',
  body text,
  created_at timestamptz not null default now()
);

alter table content_plans enable row level security;
create policy cp_select on content_plans for select using (is_admin());
create policy cp_admin_write on content_plans for all
  using (is_admin()) with check (is_admin());
