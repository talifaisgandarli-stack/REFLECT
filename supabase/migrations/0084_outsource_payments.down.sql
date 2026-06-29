-- Re-add the aggregate columns and fold paid payments back into paid_amount.
alter table public.outsource_items
  add column if not exists paid_amount numeric not null default 0 check (paid_amount >= 0),
  add column if not exists advance_pct numeric not null default 30 check (advance_pct >= 0 and advance_pct <= 100),
  add column if not exists interim_count integer not null default 0 check (interim_count >= 0);

update public.outsource_items i
  set paid_amount = coalesce((
    select sum(p.amount) from public.outsource_payments p
    where p.outsource_item_id = i.id and p.is_paid
  ), 0);

drop table if exists public.outsource_payments;
