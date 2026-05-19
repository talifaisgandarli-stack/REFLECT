-- 0040 — REQ-FIN-03 — partial payment history for receivables.
-- Until now, markPaid simply incremented receivables.paid_amount with no audit
-- trail. Admins could see only the total — not which day/amount/method each
-- partial payment came in on. Without per-event rows, finance reconciliation
-- and dispute resolution are impossible.
--
-- Additive: receivables.paid_amount stays as the running total (DB trigger
-- updates it), but every partial payment now also writes a receivable_payments
-- row capturing { amount, paid_at, payment_method, note, recorded_by }.

create table if not exists receivable_payments (
  id uuid primary key default uuid_generate_v4(),
  receivable_id uuid not null references receivables(id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  payment_method text,
  note text,
  recorded_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists receivable_payments_receivable_idx
  on receivable_payments (receivable_id, paid_at desc);

-- RLS: admin-only (PRD §9.1 — receivables and their payment events are
-- financial data, no SELECT for non-admin under any condition)
alter table receivable_payments enable row level security;

create policy receivable_payments_admin_select on receivable_payments
  for select using (is_admin());

create policy receivable_payments_admin_write on receivable_payments
  for all using (is_admin()) with check (is_admin());

-- Auto-update receivables.paid_amount when a payment is recorded.
-- Replaces the manual `paid_amount += delta` pattern in markPaid — keeps the
-- running total consistent regardless of who/how rows are inserted.
create or replace function receivable_payment_apply()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if (TG_OP = 'INSERT') then
    update receivables
       set paid_amount = coalesce(paid_amount, 0) + new.amount,
           status = case
             when coalesce(paid_amount, 0) + new.amount >= amount then 'paid'
             when coalesce(paid_amount, 0) + new.amount > 0 then 'partial'
             else status
           end
     where id = new.receivable_id;
    return new;
  elsif (TG_OP = 'DELETE') then
    update receivables
       set paid_amount = greatest(0, coalesce(paid_amount, 0) - old.amount),
           status = case
             when greatest(0, coalesce(paid_amount, 0) - old.amount) >= amount then 'paid'
             when greatest(0, coalesce(paid_amount, 0) - old.amount) > 0 then 'partial'
             else 'pending'
           end
     where id = old.receivable_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists receivable_payments_apply_trg on receivable_payments;
create trigger receivable_payments_apply_trg
  after insert or delete on receivable_payments
  for each row execute function receivable_payment_apply();
