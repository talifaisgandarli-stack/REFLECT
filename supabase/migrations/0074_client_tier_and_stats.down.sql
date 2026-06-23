drop view if exists public.client_project_stats;

-- Recreate clients_view without tier (0073 shape).
create or replace view public.clients_view as
  select
    id, name, company, email, phone, pipeline_stage, confidence_pct,
    case when public.is_admin() then expected_value else null end as expected_value,
    last_interaction_at, ai_icp_fit, ai_icp_calculated_at, created_by, created_at,
    industry
  from public.clients
  where public.is_admin() or public.is_bd_lead();
grant select on public.clients_view to authenticated;

alter table clients drop column if exists tier;
drop type if exists client_tier;
