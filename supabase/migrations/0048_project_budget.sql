-- 0048 — REQ-FIN-06 extension — optional project budget for budget-vs-actual
-- tracking. Nullable: projects without a budget render as "—" in the P&L tab.

alter table projects
  add column if not exists budget_amount numeric(14, 2);
