-- 0048 down — PRD §10.2: rename, never drop.

alter table projects
  rename column budget_amount to _deprecated_budget_amount;
