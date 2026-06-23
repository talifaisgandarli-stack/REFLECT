-- Clients audit #1 (critical) — PRD §462: BD Lead must NOT see the financial
-- field expected_value. The base policy granted full-row SELECT to bd_lead and
-- the app read select('*'), so expected_value leaked on every card / total / API
-- response. Enforce it at the data layer with two complementary guards:
--
--   1. A masked view `clients_view` that returns expected_value only to admins
--      (CASE on is_admin()) and is gated to the same roles the old clients_select
--      allowed. All app reads are repointed to this view.
--   2. A column-level REVOKE so the base `clients` table can no longer return
--      expected_value to the `authenticated` role at all — the column is only
--      reachable through the owner-privileged view (which masks it). This closes
--      the direct-API path without touching the row policies or the insert
--      RETURNING flows (write grants on the column are untouched, so admin inline
--      edits still work).

create or replace view public.clients_view as
  select
    id, name, company, email, phone, pipeline_stage, confidence_pct,
    case when public.is_admin() then expected_value else null end as expected_value,
    last_interaction_at, ai_icp_fit, ai_icp_calculated_at, created_by, created_at,
    industry
  from public.clients
  where public.is_admin() or public.is_bd_lead();
grant select on public.clients_view to authenticated;

-- Base table: hide the expected_value column from direct reads. Admins read it
-- through clients_view (owner bypasses column grants); UPDATE is unaffected.
revoke select (expected_value) on public.clients from authenticated;
