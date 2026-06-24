-- Down for 0075. Reverts the two-surface CRM redesign.
-- Note: auto-migrated starter projects are NOT deleted (data-loss guard); drop
-- them manually if a clean rollback is required.

drop view if exists public.client_summary;

drop trigger if exists projects_touch_updated_at on projects;
drop function if exists public.touch_projects_updated_at();

drop index if exists idx_projects_stage;
-- idx_projects_client predates this migration in spirit; keep it.

alter table projects drop column if exists expected_close_at;
alter table projects drop column if exists region;
alter table projects drop column if exists owner_id;
alter table projects drop column if exists progress;
alter table projects drop column if exists value;
alter table projects drop column if exists service_type;
alter table projects drop column if exists stage;
alter table projects drop column if exists updated_at;

drop type if exists service_type;
drop type if exists project_stage;

-- Restore the legacy vip/gold/silver/bronze/none tier.
drop view if exists public.clients_view;

do $$ begin
  create type client_tier as enum ('vip', 'gold', 'silver', 'bronze', 'none');
exception when duplicate_object then null; end $$;

alter table clients add column if not exists tier_legacy client_tier not null default 'none';
update clients set tier_legacy = case tier::text
  when 'A' then 'vip'::client_tier
  when 'B' then 'gold'::client_tier
  when 'C' then 'silver'::client_tier
  else 'none'::client_tier
end;
alter table clients drop column if exists tier;
alter table clients rename column tier_legacy to tier;
drop type if exists client_tier_abc;

create or replace view public.clients_view as
  select
    id, name, company, email, phone, pipeline_stage, confidence_pct,
    case when public.is_admin() then expected_value else null end as expected_value,
    last_interaction_at, ai_icp_fit, ai_icp_calculated_at, created_by, created_at,
    industry, tier
  from public.clients
  where public.is_admin() or public.is_bd_lead();
grant select on public.clients_view to authenticated;
