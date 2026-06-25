-- Down for 0077 — restore the prior (buggy) trigger body with 'pending'.
-- Kept for strict reversibility only; do not re-apply in production.
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
