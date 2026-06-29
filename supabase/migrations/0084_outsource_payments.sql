-- Podrat payments — REQ-FIN-07. A subcontract is paid in discrete instalments
-- (Avans / Ara / Final), each with its own amount, method and paid flag. The
-- single paid_amount/advance_pct/interim_count aggregate from 0083 could not
-- model that, so payments move to their own table (the source of truth) and the
-- aggregate columns are dropped after migrating their data forward.
create table if not exists public.outsource_payments (
  id uuid primary key default uuid_generate_v4(),
  outsource_item_id uuid not null references public.outsource_items(id) on delete cascade,
  kind text not null default 'interim' check (kind in ('advance', 'interim', 'final')),
  label text,
  amount numeric not null check (amount > 0),
  method text check (method in ('cash', 'bank_transfer', 'card')),
  is_paid boolean not null default false,
  paid_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_outsource_payments_item
  on public.outsource_payments(outsource_item_id);

-- Admin-only, mirroring outsource_items (members never see podrat finance).
alter table public.outsource_payments enable row level security;
drop policy if exists outsource_payments_admin on public.outsource_payments;
create policy outsource_payments_admin on public.outsource_payments
  for all using (is_admin()) with check (is_admin());

-- Preserve existing data: fold each item's paid_amount into one payment record
-- so nothing already entered is lost. Kind = final if it fully settled the
-- contract, else advance. Guarded so this runs whether or not 0083's aggregate
-- columns made it in (its view step could have rolled the txn back).
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'outsource_items' and column_name = 'paid_amount'
  ) then
    insert into public.outsource_payments (outsource_item_id, kind, label, amount, method, is_paid, paid_at)
    select id,
           case when amount is not null and paid_amount >= amount then 'final' else 'advance' end,
           'Köçürülmüş ödəniş',
           paid_amount,
           payment_method,
           true,
           coalesce(paid_at, now())
    from public.outsource_items
    where paid_amount is not null and paid_amount > 0;
  end if;
end $$;

-- Drop the stopgap aggregate columns — payments are authoritative now.
alter table public.outsource_items
  drop column if exists paid_amount,
  drop column if exists advance_pct,
  drop column if exists interim_count;
