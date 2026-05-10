-- PRD §11 / REQ-FIN-* — activity_log entries for incomes and expenses so the
-- Dashboard "Gəlir/Xərc" filter has rows to show. Without these triggers the
-- filter is permanently empty.
--
-- We also log salary inserts (US-SAL-02) — covered separately by the audit
-- requirement that compensation changes leave a trail.

create or replace function public.incomes_activity_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform log_activity('incomes', new.id, 'created', null, null,
      jsonb_build_object('amount', new.amount, 'project_id', new.project_id, 'client_id', new.client_id));
  elsif tg_op = 'UPDATE' then
    if new.amount is distinct from old.amount then
      perform log_activity('incomes', new.id, 'amount_changed', 'amount',
        to_jsonb(old.amount), to_jsonb(new.amount));
    end if;
  elsif tg_op = 'DELETE' then
    perform log_activity('incomes', old.id, 'deleted', null, to_jsonb(old), null);
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists incomes_activity on incomes;
create trigger incomes_activity
  after insert or update or delete on incomes
  for each row execute function public.incomes_activity_trg();

create or replace function public.expenses_activity_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform log_activity('expenses', new.id, 'created', null, null,
      jsonb_build_object('amount', new.amount, 'category', new.category, 'project_id', new.project_id));
  elsif tg_op = 'UPDATE' then
    if new.amount is distinct from old.amount then
      perform log_activity('expenses', new.id, 'amount_changed', 'amount',
        to_jsonb(old.amount), to_jsonb(new.amount));
    end if;
  elsif tg_op = 'DELETE' then
    perform log_activity('expenses', old.id, 'deleted', null, to_jsonb(old), null);
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists expenses_activity on expenses;
create trigger expenses_activity
  after insert or update or delete on expenses
  for each row execute function public.expenses_activity_trg();

create or replace function public.salaries_activity_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform log_activity('salaries', new.id, 'created', null, null,
      jsonb_build_object('employee_id', new.employee_id, 'amount', new.amount,
        'currency', new.currency, 'effective_from', new.effective_from));
  elsif tg_op = 'UPDATE' and new.amount is distinct from old.amount then
    perform log_activity('salaries', new.id, 'amount_changed', 'amount',
      to_jsonb(old.amount), to_jsonb(new.amount));
  end if;
  return new;
end;
$$;

drop trigger if exists salaries_activity on salaries;
create trigger salaries_activity
  after insert or update on salaries
  for each row execute function public.salaries_activity_trg();
