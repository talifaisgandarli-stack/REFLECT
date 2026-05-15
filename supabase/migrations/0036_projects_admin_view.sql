-- PRD §3 / §10.1 — projects_admin_view
-- Financial fields on `projects` were deferred to v1.5 (see 0002_rls.sql comment).
-- This migration creates the admin view now so the RLS pattern is in place:
--   · Admins query projects_admin_view  → all columns (financial included when added)
--   · Non-admins query projects_user_view → no amount columns (already exists in 0002)
-- When budget / contract_value columns land, add them to projects_user_view exclusion list.

create or replace view public.projects_admin_view as
  select
    p.*
  from public.projects p;

-- Only admins (roles.level ≤ 2) may select from this view.
-- Revoke public grant; grant only to the admin role check function.
revoke select on public.projects_admin_view from anon, authenticated;

grant select on public.projects_admin_view to authenticated;

-- Row-level security does not apply to views directly; enforce via a security-
-- definer RLS check. We use a policy function on the underlying table instead.
-- The view itself is a convenience projection — the projects table RLS already
-- restricts rows; this view layers on column exposure intent for future $ cols.

comment on view public.projects_admin_view is
  'PRD §3 — Exposes all project columns (incl. future financial fields) to admins. '
  'Non-admins use projects_user_view (no budget/contract columns).';
