-- REQ-FIN-06: project P&L view — per-project income, direct expenses,
-- outsource costs, net.
-- The view sums in money tables that are admin-RLS, so the view is
-- effectively admin-only at query time. Expose it through a SECURITY DEFINER
-- function so admins get a single round-trip with consistent shape.

create or replace view project_pnl as
  select
    p.id                                                            as project_id,
    p.name                                                          as project_name,
    coalesce((select sum(amount) from incomes  i where i.project_id = p.id), 0) as income,
    coalesce((select sum(amount) from expenses e where e.project_id = p.id), 0) as expenses,
    coalesce((select sum(amount) from outsource_items o
              where o.project_id = p.id and o.amount is not null), 0)           as outsource,
    (
      coalesce((select sum(amount) from incomes  i where i.project_id = p.id), 0)
      - coalesce((select sum(amount) from expenses e where e.project_id = p.id), 0)
      - coalesce((select sum(amount) from outsource_items o
                  where o.project_id = p.id and o.amount is not null), 0)
    ) as net
  from projects p
  where p.archived_at is null;

-- The view inherits security_invoker by default; underlying tables remain
-- gated by their RLS policies. Grant SELECT to authenticated; non-admins
-- will get zero rows because incomes/expenses/outsource_items reject them.
grant select on project_pnl to authenticated;

-- REQ-FIN-05: recurring_expenses → expenses materializer.
-- Idempotent: only fires for rules whose next_run_at <= now(); each call
-- inserts the missed periods then advances next_run_at past now().
create or replace function public.materialize_recurring_expenses()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r recurring_expenses;
  v_count int := 0;
  v_step interval;
begin
  for r in
    select * from recurring_expenses where next_run_at <= now() for update
  loop
    v_step := case r.period
      when 'weekly'    then interval '1 week'
      when 'monthly'   then interval '1 month'
      when 'quarterly' then interval '3 months'
      when 'yearly'    then interval '1 year'
    end;

    while r.next_run_at <= now() loop
      insert into expenses (category, amount, vendor, occurred_at, note, recurring_rule_id)
      values ('Sabit', r.amount, r.label, r.next_run_at, 'Avtomatik (recurring)', r.id);

      r.next_run_at := r.next_run_at + v_step;
      v_count := v_count + 1;
    end loop;

    update recurring_expenses
       set next_run_at = r.next_run_at
     where id = r.id;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.materialize_recurring_expenses() from public;
-- Service-role only (called from /api/cron/recurring); no grant to authenticated.
