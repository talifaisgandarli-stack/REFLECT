drop function if exists public.mark_receivable_paid(uuid, numeric);
drop trigger if exists receivables_sync on receivables;
drop function if exists public.receivables_sync_status();
