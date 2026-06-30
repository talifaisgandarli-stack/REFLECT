-- REQ-PROJ / REQ-FIN — projects gain an optional contract code (müqavilə kodu),
-- a free-text reference users key the signed contract by. Additive + surfaced to
-- the member view (it's a label, not a financial amount). projects_admin_view is
-- `select p.*` so it picks the column up automatically.
alter table public.projects
  add column if not exists contract_code text;

drop view if exists public.projects_user_view;
create view public.projects_user_view
  with (security_invoker = on) as
  select id, name, client_id, phases, requires_expertise, expertise_deadline,
         payment_buffer_days, deadline, start_date, status, created_by,
         created_at, archived_at, reopened_at, tags, description, contract_code
  from public.projects;
grant select on public.projects_user_view to authenticated;
