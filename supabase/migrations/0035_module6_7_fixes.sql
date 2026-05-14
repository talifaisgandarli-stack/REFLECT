-- 0035: Module 6 + 7 fixes
-- ============================================================================
-- Module 6 / REQ-CRM-07: retrospective_surveys missing INSERT policy
-- The RetroSurveyTrigger component inserts a row on project close, but 0002_rls
-- only has SELECT + UPDATE policies — no INSERT — so the call fails silently.
-- ============================================================================
create policy rs_insert on retrospective_surveys
  for insert
  to authenticated
  with check (
    is_admin()
    or (project_id is not null and is_project_member(project_id))
  );

-- ============================================================================
-- Module 6 / BD Lead RLS: PRD §6 line 398
-- "BD Lead role (level 3) granted SELECT/INSERT but NOT financial fields (expected_value)"
-- PostgreSQL has no column-level RLS; enforce via BEFORE trigger instead.
-- Non-admin callers (including BD Lead) have expected_value silently zeroed.
-- Admins pass through unchanged.
-- ============================================================================
create or replace function public.clients_mask_bd_lead_financials()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    new.expected_value := null;
  end if;
  return new;
end;
$$;

create trigger clients_bd_lead_expected_value
  before insert or update on public.clients
  for each row
  execute function public.clients_mask_bd_lead_financials();
