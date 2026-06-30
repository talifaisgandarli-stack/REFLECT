drop view if exists public.projects_user_view;
create view public.projects_user_view
  with (security_invoker = on) as
  select id, name, client_id, phases, requires_expertise, expertise_deadline,
         payment_buffer_days, deadline, start_date, status, created_by,
         created_at, archived_at, reopened_at, tags, description
  from public.projects;
grant select on public.projects_user_view to authenticated;

alter table public.projects
  drop column if exists contract_code;
