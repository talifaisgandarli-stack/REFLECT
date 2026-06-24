-- 0075 — CRM redesign (owner override 2026-06-24): two-surface model.
--
-- Owner decision (talifa.isgandarli@gmail.com, 2026-06-24): adopt the original
-- "Reflect CRM redesign" spec verbatim, overriding the earlier PRD-adaptation
-- (docs/clients-crm-spec-adapted.md). This reverses the previously-rejected
-- points: stage moves onto PROJECTS, tiers become A/B/C, projects gain
-- value/progress/service_type/region, and the client base becomes a card grid
-- fed by an aggregate `client_summary` view.
--
-- Strategy (owner-approved): FULL REPLACE of the UI surface; the legacy
-- `clients.pipeline_stage` / `confidence_pct` columns are KEPT (not dropped) so
-- Finance, Dashboard and ICP keep working — the new pipeline simply stops using
-- them as the primary surface. Existing client stage + value is AUTO-MIGRATED
-- into one starter project per (non-archived) client.

-- ── New enums ────────────────────────────────────────────────────────────────
do $$ begin
  create type project_stage as enum
    ('lead', 'teklif', 'muzakire', 'icrada', 'portfolio', 'udulan');
exception when duplicate_object then null; end $$;

do $$ begin
  create type service_type as enum
    ('tikinti', 'dizayn', 'konsultasiya', 'renovasiya');
exception when duplicate_object then null; end $$;

-- ── projects: pipeline columns ───────────────────────────────────────────────
alter table projects add column if not exists stage          project_stage not null default 'lead';
alter table projects add column if not exists service_type   service_type;
alter table projects add column if not exists value          numeric(14,2) not null default 0;
alter table projects add column if not exists progress       smallint not null default 0 check (progress between 0 and 100);
alter table projects add column if not exists owner_id        uuid references profiles(id);
alter table projects add column if not exists region         text;
alter table projects add column if not exists expected_close_at timestamptz;
alter table projects add column if not exists updated_at     timestamptz not null default now();

create index if not exists idx_projects_client on projects(client_id);
create index if not exists idx_projects_stage  on projects(stage);

-- keep updated_at fresh on every project mutation
create or replace function public.touch_projects_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists projects_touch_updated_at on projects;
create trigger projects_touch_updated_at
  before update on projects
  for each row execute function public.touch_projects_updated_at();

-- ── clients.tier → A/B/C ─────────────────────────────────────────────────────
-- The legacy `client_tier` enum (vip/gold/silver/bronze/none) is replaced by an
-- A/B/C segment. clients_view depends on the column, so drop → convert → recreate.
do $$ begin
  create type client_tier_abc as enum ('A', 'B', 'C');
exception when duplicate_object then null; end $$;

drop view if exists public.clients_view;

-- Convert ONLY if the column is still the legacy `client_tier` enum. This makes
-- the migration safe to re-run (a second run finds tier already = client_tier_abc
-- and skips, so the A/B/C data is never re-mapped/lost).
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'clients'
      and column_name = 'tier' and udt_name = 'client_tier'
  ) then
    alter table clients add column if not exists tier_abc client_tier_abc;
    -- map the old segment to the new one (best-effort, owner-approved):
    --   vip → A (strateji), gold → B (orta), silver/bronze → C (kiçik), none → null
    update clients set tier_abc = case tier::text
      when 'vip'    then 'A'::client_tier_abc
      when 'gold'   then 'B'::client_tier_abc
      when 'silver' then 'C'::client_tier_abc
      when 'bronze' then 'C'::client_tier_abc
      else null
    end;
    alter table clients drop column tier;
    alter table clients rename column tier_abc to tier;
  end if;
end $$;

-- recreate the masked read view with the A/B/C tier (keeps expected_value mask, 0073)
create or replace view public.clients_view as
  select
    id, name, company, email, phone, pipeline_stage, confidence_pct,
    case when public.is_admin() then expected_value else null end as expected_value,
    last_interaction_at, ai_icp_fit, ai_icp_calculated_at, created_by, created_at,
    industry, tier
  from public.clients
  where public.is_admin() or public.is_bd_lead();
grant select on public.clients_view to authenticated;

-- ── client_summary — aggregate for the card grid ─────────────────────────────
-- One row per client with project counts and total value (value masked for
-- non-admins, mirroring clients_view / 0073). Gated to the CRM roles.
create or replace view public.client_summary as
  select
    c.id, c.name, c.company, c.email, c.phone, c.tier, c.industry,
    c.last_interaction_at as last_contact_at, c.ai_icp_fit, c.created_at,
    count(p.id)                                                    as total_projects,
    count(p.id) filter (where p.stage in
      ('lead','teklif','muzakire','icrada'))                      as active_projects,
    case when public.is_admin()
         then coalesce(sum(p.value), 0) else null end             as total_value,
    bool_or(p.stage in ('lead','teklif','muzakire','icrada'))     as has_active_work
  from public.clients c
  left join public.projects p on p.client_id = c.id
  where public.is_admin() or public.is_bd_lead()
  group by c.id;
grant select on public.client_summary to authenticated;

-- ── Auto-migrate: one starter project per existing (non-archived) client ─────
-- Carries the client's pipeline_stage + expected_value into the new model so no
-- relationship/value data is lost. Idempotent: skips clients that already have
-- a project (re-runnable migration).
insert into projects (client_id, name, stage, value, owner_id, created_by, created_at)
select
  c.id,
  coalesce(nullif(c.company, ''), c.name),
  case c.pipeline_stage::text
    when 'lead'        then 'lead'::project_stage
    when 'proposal'    then 'teklif'::project_stage
    when 'negotiation' then 'muzakire'::project_stage
    when 'signed'      then 'icrada'::project_stage
    when 'in_progress' then 'icrada'::project_stage
    when 'portfolio'   then 'portfolio'::project_stage
    when 'lost'        then 'udulan'::project_stage
    else 'lead'::project_stage
  end,
  coalesce(c.expected_value, 0),
  c.created_by,
  c.created_by,
  c.created_at
from clients c
where c.pipeline_stage::text <> 'archived'
  and not exists (select 1 from projects p where p.client_id = c.id);
