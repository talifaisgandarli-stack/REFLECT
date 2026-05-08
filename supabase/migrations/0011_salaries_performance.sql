-- PRD §3.2 / §8.2 / §8.3 — close the schema gap: tables `salaries` and
-- `performance_reviews` are canonical in PRD but were never created by 0001.
--
-- RLS resolution for §9.1 vs §8.2 conflict (decided 2026-05-08 with user):
-- §8.2 wins for `salaries` — admin OR auth.uid() = employee_id.
-- §9.1 wording therefore carves out salaries.self; PRD §9.1 should be edited
-- in a follow-up to read: "...salaries (admin OR self), outsource_items, ...".

create table if not exists salaries (
  id              uuid primary key default uuid_generate_v4(),
  employee_id     uuid not null references profiles(id) on delete cascade,
  amount          numeric not null check (amount > 0),
  currency        text not null default 'AZN',
  effective_from  date not null,
  effective_to    date,
  components      jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists idx_salaries_employee on salaries(employee_id, effective_from desc);

alter table salaries enable row level security;
create policy salaries_select on salaries for select
  using (is_admin() or auth.uid() = employee_id);
create policy salaries_admin_write on salaries for all
  using (is_admin()) with check (is_admin());

create table if not exists performance_reviews (
  id           uuid primary key default uuid_generate_v4(),
  employee_id  uuid not null references profiles(id) on delete cascade,
  year         int  not null check (year >= 2026),
  score        numeric not null check (score >= 0 and score <= 100),
  ratings      jsonb not null default '{}'::jsonb,
  reviewer_id  uuid references profiles(id),
  summary      text,
  created_at   timestamptz not null default now(),
  unique (employee_id, year)
);
create index if not exists idx_perf_employee on performance_reviews(employee_id, year desc);

-- US-PERF-01: user sees self for all years; admin sees all.
alter table performance_reviews enable row level security;
create policy perf_select on performance_reviews for select
  using (is_admin() or auth.uid() = employee_id);
create policy perf_admin_write on performance_reviews for all
  using (is_admin()) with check (is_admin());
