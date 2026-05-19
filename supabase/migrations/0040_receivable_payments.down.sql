-- 0040 down — PRD §10.2: rename, never drop.

drop trigger if exists receivable_payments_apply_trg on receivable_payments;
drop function if exists receivable_payment_apply();

alter table receivable_payments rename to _archived_receivable_payments_2026;
