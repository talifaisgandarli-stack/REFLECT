-- Critical: enforce PRD §348 column separation and close the projects_admin_view
-- data-exposure hole.
--
-- Two problems this fixes:
--  1. The client read `projects.*` directly, so `budget_amount` (0048) reached
--     non-admins over the wire (RLS is row-level, not column-level). Non-admins
--     now read projects_user_view, which has every non-financial column but NOT
--     budget_amount.
--  2. projects_admin_view was `grant select ... to authenticated` AND ran as its
--     owner (definer), so ANY logged-in user could read every project's budget
--     via /rest/v1/projects_admin_view, bypassing the projects RLS entirely.
--
-- Both views are recreated with `security_invoker = on` so the projects RLS
-- (admin or project member) governs which rows are visible; admin_view adds a
-- `where is_admin()` gate so only admins receive the financial columns.

-- Non-admin surface — all non-financial columns (adds payment_buffer_days,
-- reopened_at, tags, description that the old view omitted), no budget_amount.
drop view if exists public.projects_user_view;
create view public.projects_user_view
  with (security_invoker = on) as
  select id, name, client_id, phases, requires_expertise, expertise_deadline,
         payment_buffer_days, deadline, start_date, status, created_by,
         created_at, archived_at, reopened_at, tags, description
  from public.projects;
grant select on public.projects_user_view to authenticated;

-- Admin surface — all columns, but only admins get rows (closes the bypass).
drop view if exists public.projects_admin_view;
create view public.projects_admin_view
  with (security_invoker = on) as
  select p.*
  from public.projects p
  where public.is_admin();
grant select on public.projects_admin_view to authenticated;
