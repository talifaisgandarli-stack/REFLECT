-- 0077 — Fix receivable_payment_apply(): invalid enum on full reversal.
--
-- Audit finding (BLOCKER, 2026-06-25): on DELETE, when a payment reversal brings
-- paid_amount back to 0, the trigger set status = 'pending' — but the
-- receivable_status enum is ('open','partial','paid','overdue'). 'pending' is
-- not a member, so the UPDATE (and thus the payment DELETE) raised
-- "invalid input value for enum receivable_status" and failed entirely —
-- breaking payment reversal. Correct terminal state is 'open'.
--
-- Only the DELETE branch's else-value changes ('pending' → 'open'); INSERT branch
-- unchanged. Idempotent: CREATE OR REPLACE.

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
             else 'open'
           end
     where id = old.receivable_id;
    return old;
  end if;
  return null;
end;
$$;
