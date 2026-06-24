-- 0076 — Revert the project-pipeline experiment; keep clients/projects separate.
--
-- Owner decision (2026-06-24): the CRM pipeline belongs on CLIENTS (PRD Module 6
-- / pipeline_stage), and `projects` must stay the architectural-project module
-- (PRD Module 3) — they are separate concerns. Migration 0075 wrongly moved the
-- pipeline onto projects and auto-created one starter project per client, which
-- polluted the Layihələr module. This reverts the projects-side changes and
-- removes those auto-created rows. The A/B/C tier (also from 0075) is KEPT.

-- 1) Remove the auto-created starter projects (surgical: exactly the rows 0075
--    inserted — name = client company/name AND created_at copied from the client).
delete from projects p
using clients c
where p.client_id = c.id
  and p.created_at = c.created_at
  and p.name = coalesce(nullif(c.company, ''), c.name);

-- 2) Drop the project-pipeline view/trigger/index/columns/types (revert 0075).
drop view if exists public.client_summary;

drop trigger if exists projects_touch_updated_at on projects;
drop function if exists public.touch_projects_updated_at();

drop index if exists idx_projects_stage;

alter table projects drop column if exists stage;
alter table projects drop column if exists service_type;
alter table projects drop column if exists value;
alter table projects drop column if exists progress;
alter table projects drop column if exists owner_id;
alter table projects drop column if exists region;
alter table projects drop column if exists expected_close_at;
alter table projects drop column if exists updated_at;

drop type if exists project_stage;
drop type if exists service_type;

-- clients.tier (A/B/C), clients_view and client_project_stats are unchanged.
