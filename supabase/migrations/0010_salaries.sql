-- salaries table — PRD §3.2 / Module 8.2 (Əmək Haqqı)
-- Schema: (id, employee_id, amount, currency, effective_from, effective_to, components jsonb)
-- RLS: user sees own rows; admin sees all.

create table if not exists salaries (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references profiles(id) on delete cascade,
  amount numeric not null check (amount > 0),
  currency text not null default 'AZN' check (currency in ('AZN', 'USD', 'EUR')),
  effective_from date not null,
  effective_to date,
  components jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint sal_dates_ok check (effective_to is null or effective_to > effective_from)
);

create index if not exists idx_salaries_employee on salaries(employee_id, effective_from desc);

alter table salaries enable row level security;

-- Users may SELECT their own rows.
create policy sal_self_select on salaries for select
  using (employee_id = auth.uid());

-- Admins have full access.
create policy sal_admin_all on salaries for all
  using (is_admin()) with check (is_admin());
