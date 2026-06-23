-- Outsource fixes (audit #2 + #4):
--  #2 paid_at was never written, so the "Ödəniş tarixi" column and the paid
--     breakdown were always empty. Set it automatically on the status<->paid
--     transition (works for both the create form and the advance buttons, and
--     any direct update). Leaving 'paid' clears it.
--  #4 outsource_items had no activity_log trigger despite PRD §6.1 audit
--     requirement. Mirror the tasks/projects pattern (fail-open, security definer).

-- ---------------------------------------------------------------------------
-- #2 — auto-stamp paid_at when status enters 'paid'; clear it when it leaves.
-- ---------------------------------------------------------------------------
create or replace function public.outsource_paid_at_trg()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'paid' and new.paid_at is null then
    new.paid_at := now();
  elsif new.status <> 'paid' then
    new.paid_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists outsource_paid_at on outsource_items;
create trigger outsource_paid_at
  before insert or update on outsource_items
  for each row execute function public.outsource_paid_at_trg();

-- ---------------------------------------------------------------------------
-- #4 — activity_log for create / status / amount / delete (PRD §6.1, line 569).
-- ---------------------------------------------------------------------------
create or replace function public.outsource_activity_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform log_activity('outsource', new.id, 'created', null, null, to_jsonb(new));
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      perform log_activity('outsource', new.id, 'status_changed', 'status',
        to_jsonb(old.status), to_jsonb(new.status));
    end if;
    if new.amount is distinct from old.amount then
      perform log_activity('outsource', new.id, 'amount_changed', 'amount',
        to_jsonb(old.amount), to_jsonb(new.amount));
    end if;
  elsif tg_op = 'DELETE' then
    perform log_activity('outsource', old.id, 'deleted', null, to_jsonb(old), null);
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists outsource_activity on outsource_items;
create trigger outsource_activity
  after insert or update or delete on outsource_items
  for each row execute function public.outsource_activity_trg();
