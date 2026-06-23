-- Müştərilər account-management view (new):
--   * clients.tier — relationship segment (VIP/Gold/Silver/Bronze) so the firm can
--     prioritise accounts. Not a financial field, so it is visible to BD Lead too
--     (admin-only to *edit*, enforced in the app per product decision 2026-06).
--   * clients_view recreated to expose tier (and keep expected_value masked, 0073).
--   * client_project_stats — per-client project counts (total / active) for the
--     table view, as one aggregate (no N+1), gated to the CRM roles.

create type client_tier as enum ('vip', 'gold', 'silver', 'bronze', 'none');
alter table clients add column if not exists tier client_tier not null default 'none';

-- Recreate the masked read view with the new tier column (0073 pattern).
create or replace view public.clients_view as
  select
    id, name, company, email, phone, pipeline_stage, confidence_pct,
    case when public.is_admin() then expected_value else null end as expected_value,
    last_interaction_at, ai_icp_fit, ai_icp_calculated_at, created_by, created_at,
    industry, tier
  from public.clients
  where public.is_admin() or public.is_bd_lead();
grant select on public.clients_view to authenticated;

-- Per-client project counts for the table view. Gated to CRM roles; owner view
-- so it aggregates across projects without per-row RLS round-trips.
create or replace view public.client_project_stats as
  select
    p.client_id,
    count(*) as total_projects,
    count(*) filter (where p.status = 'active' and p.archived_at is null) as active_projects
  from public.projects p
  where p.client_id is not null
    and (public.is_admin() or public.is_bd_lead())
  group by p.client_id;
grant select on public.client_project_stats to authenticated;
