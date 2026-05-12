-- REQ-FIN-01: When an income is created against a receivable, mark the
-- receivable as paid (or partial if amount < remaining). Trigger keeps client
-- code simple and is race-free.
--
-- US-FIN-08: nextInvoiceNumber via sequence (postgres serial) — eliminates
-- the read-then-write race where two parallel users get the same number.

-- ---------------------------------------------------------------------------
-- Sequence + RPC for atomic invoice numbering.
create sequence if not exists invoice_number_seq start with 1001;

create or replace function next_invoice_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
  yr text;
begin
  n := nextval('invoice_number_seq');
  yr := to_char(now() at time zone 'Asia/Baku', 'YYYY');
  return 'INV-' || yr || '-' || lpad(n::text, 4, '0');
end;
$$;

revoke all on function next_invoice_number() from public;
grant execute on function next_invoice_number() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Auto-mark receivable when income references the same client+project.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_name = 'incomes' and column_name = 'receivable_id'
  ) then
    alter table incomes add column receivable_id uuid references receivables(id) on delete set null;
  end if;
end $$;

create or replace function public.incomes_mark_receivable()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  rec record;
  remaining numeric;
begin
  if new.receivable_id is null then return new; end if;

  select id, amount, status,
         coalesce((select sum(i.amount) from incomes i where i.receivable_id = receivables.id), 0) as paid
    into rec
    from receivables where id = new.receivable_id;

  if not found then return new; end if;

  remaining := rec.amount - rec.paid;
  if remaining <= 0 then
    update receivables set status = 'paid' where id = new.receivable_id;
  elsif rec.paid > 0 then
    update receivables set status = 'partial' where id = new.receivable_id;
  end if;
  return new;
end;
$$;

drop trigger if exists incomes_mark_receivable on incomes;
create trigger incomes_mark_receivable
  after insert on incomes
  for each row execute function public.incomes_mark_receivable();
