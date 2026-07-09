-- Per-payment ƏDV flag (owner request 2026-07-16).
-- Some project payments include VAT (typically bank transfers), some don't
-- (typically cash). A blanket project-level VAT division misstates profit on
-- mixed projects, so each income row records whether its amount is ƏDV-li and
-- at what rate. Optional: the admin ticks it per payment.

alter table incomes
  add column if not exists vat_included boolean not null default false,
  add column if not exists vat_rate numeric(5,2);

comment on column incomes.vat_included is 'Məbləğ ƏDV-lidir — net hesablamada amount/(1+vat_rate/100) istifadə olunur.';
comment on column incomes.vat_rate is 'Bu ödənişə tətbiq olunan ƏDV faizi (vat_included olduqda; default layihənin dərəcəsi).';
