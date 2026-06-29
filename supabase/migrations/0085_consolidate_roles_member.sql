-- Role consolidation — collapse the unused non-admin labels (Manager, BD Lead,
-- Viewer) into a single "Member" role, leaving three effective roles: Creator,
-- Admin, Member. The 5-label model was never enforced (only is_admin and the
-- now-removed BD-Lead CRM carve-out had any effect), so this matches reality.
--
-- Decision (2026-06-29): CRM stays admin-only — BD Lead's client access is
-- dropped. With the bd_lead role gone, is_bd_lead() is always false, so the
-- existing `is_admin() or is_bd_lead()` client policies become admin-only with
-- no policy churn.

-- 1. Re-point everyone on a consolidated role to Member, then retire the rows.
update public.profiles
  set role_id = (select id from public.roles where key = 'member')
  where role_id in (select id from public.roles where key in ('manager', 'bd_lead', 'viewer'));

update public.invitations
  set role_id = (select id from public.roles where key = 'member')
  where role_id in (select id from public.roles where key in ('manager', 'bd_lead', 'viewer'));

delete from public.roles where key in ('manager', 'bd_lead', 'viewer');

-- 2. Members now see EVERY project (Trello-style collaboration), not only the
--    ones they're assigned to. Financial columns stay hidden: the member UI
--    reads projects_user_view (which omits budget_amount) and P&L is admin-only.
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select
  using (auth.role() = 'authenticated');
