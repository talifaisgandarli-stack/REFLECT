-- Project Finance 2.0 (owner spec 2026-07-06)
-- Adds: contract value (ƏDV-siz) + VAT rate on projects, a payment-milestone
-- label on incomes (Avans/Ara/Yekun), and a per-project / per-month overhead
-- allocation table so shared salaries + office costs can be split across
-- parallel projects to compute a real net profit.
--
-- Additive only. Financial columns stay OFF the member-facing projects_user_view
-- (0086) — that view selects an explicit column list, so nothing leaks here.

-- 1. Contract value, split net (ƏDV-siz) + VAT rate. Profit maths use the net
--    amount because the 18% ƏDV is passed to the state, not company revenue.
alter table projects
  add column if not exists contract_value_net numeric(14,2),
  add column if not exists vat_rate numeric(5,2) not null default 18;

comment on column projects.contract_value_net is 'Müqavilə dəyəri, ƏDV-siz (AZN). Brutto = net * (1 + vat_rate/100).';
comment on column projects.vat_rate is 'ƏDV faizi (default 18). Brutto dəyəri hesablamaq üçün.';

-- 2. Payment milestone label on incomes — a project payment is an installment of
--    the contract value tied to a delivery stage (advance / interim / final).
alter table incomes
  add column if not exists payment_kind text
    check (payment_kind is null or payment_kind in ('advance', 'interim', 'final'));

comment on column incomes.payment_kind is 'Ödəniş mərhələsi: advance=Avans, interim=Ara, final=Yekun. null=ümumi.';

-- 3. Overhead allocation: for a given month, what share of the firm-wide
--    overhead pool (salaries + general/office expenses) a project absorbs.
--    percent is a 0–100 share of that month's pool; locked freezes a closed
--    month so historical profit doesn't drift when salaries later change.
create table if not exists project_overhead_allocations (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  period_month date not null,               -- first day of the month
  percent numeric(5,2) not null default 0 check (percent >= 0 and percent <= 100),
  -- Snapshot of the AZN overhead assigned at save time (pool * percent/100), so
  -- a project's historical net profit stays stable even when salaries later
  -- change, and the project page reads amounts without recomputing month pools.
  overhead_amount numeric(14,2) not null default 0,
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, period_month)
);

comment on table project_overhead_allocations is 'Aylıq overhead (maaş+ofis) bölgüsü: hər layihəyə düşən faiz. Net profit hesablaması üçün.';

alter table project_overhead_allocations enable row level security;
create policy poa_admin_all on project_overhead_allocations
  for all using (is_admin()) with check (is_admin());

create index if not exists poa_period_idx on project_overhead_allocations (period_month);
