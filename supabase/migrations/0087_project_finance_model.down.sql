-- Revert 0087_project_finance_model.

drop table if exists project_overhead_allocations cascade;

alter table incomes drop column if exists payment_kind;

alter table projects
  drop column if exists contract_value_net,
  drop column if exists vat_rate;
