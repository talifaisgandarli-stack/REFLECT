-- 0034: projects_admin_view + projects_user_view
-- PRD §10.3 line 312: "Financial fields exposed via projects_admin_view;
--   non-admins query projects_user_view (no amount columns)"

-- Admin view: all project columns + aggregated financials, restricted to admins
create or replace view public.projects_admin_view
with (security_invoker = true)
as
select
  p.*,
  coalesce(i.total_income, 0)    as total_income,
  coalesce(e.total_expenses, 0)  as total_expenses,
  coalesce(o.total_outsource, 0) as total_outsource,
  coalesce(i.total_income, 0)
    - coalesce(e.total_expenses, 0)
    - coalesce(o.total_outsource, 0) as net_pnl
from projects p
left join (
  select project_id, sum(amount) as total_income
  from incomes
  group by project_id
) i on i.project_id = p.id
left join (
  select project_id, sum(amount) as total_expenses
  from expenses
  group by project_id
) e on e.project_id = p.id
left join (
  select project_id, sum(amount) as total_outsource
  from outsource_items
  where status = 'paid'
  group by project_id
) o on o.project_id = p.id
where public.is_admin();

grant select on public.projects_admin_view to authenticated;

-- User view: project fields only, no financial amounts
create or replace view public.projects_user_view
with (security_invoker = true)
as
select
  p.id,
  p.name,
  p.client_id,
  p.phases,
  p.requires_expertise,
  p.expertise_deadline,
  p.payment_buffer_days,
  p.deadline,
  p.start_date,
  p.status,
  p.created_by,
  p.created_at,
  p.archived_at,
  p.reopened_at
from projects p;

grant select on public.projects_user_view to authenticated;
