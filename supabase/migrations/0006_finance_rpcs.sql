-- REQ-FIN-01..04 helpers.
-- All RPCs run as security invoker so that RLS (admin-only on finance tables,
-- per PRD §9.1) gates access — no privilege escalation.

-- REQ-FIN-02 / REQ-FIN-03: keep receivables.status in sync with paid_amount.
-- Centralised in a trigger so every code path benefits, including direct
-- updates from admin SQL or future imports.
create or replace function public.receivables_sync_status()
returns trigger
language plpgsql
as $$
begin
  if new.paid_amount > new.amount then
    raise exception 'overpayment_blocked' using errcode = 'P0001';
  end if;

  if new.paid_amount = 0 then
    new.status := case
      when new.due_at is not null and new.due_at < (now() at time zone 'Asia/Baku')::date then 'overdue'
      else 'open'
    end;
  elsif new.paid_amount < new.amount then
    new.status := 'partial';
  else
    new.status := 'paid';
  end if;
  return new;
end;
$$;

drop trigger if exists receivables_sync on receivables;
create trigger receivables_sync
  before insert or update of paid_amount, amount, due_at on receivables
  for each row execute function public.receivables_sync_status();

-- REQ-FIN-03: partial markPaid — adds delta atomically, validates non-negative,
-- never lets paid_amount exceed amount.
create or replace function public.mark_receivable_paid(
  p_receivable_id uuid,
  p_delta numeric
)
returns receivables
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row receivables;
begin
  if p_delta is null or p_delta <= 0 then
    raise exception 'delta_must_be_positive' using errcode = 'P0001';
  end if;

  update receivables
     set paid_amount = paid_amount + p_delta
   where id = p_receivable_id
   returning * into v_row;

  if not found then
    raise exception 'receivable_not_found' using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

grant execute on function public.mark_receivable_paid(uuid, numeric) to authenticated;
