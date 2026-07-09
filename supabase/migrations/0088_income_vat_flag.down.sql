-- Revert 0088_income_vat_flag.

alter table incomes
  drop column if exists vat_included,
  drop column if exists vat_rate;
