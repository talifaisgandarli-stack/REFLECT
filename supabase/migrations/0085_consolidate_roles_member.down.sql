-- Restore the scoped project visibility.
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select
  using (is_admin() or is_project_member(id));

-- Re-seed the consolidated roles (profiles stay on Member — the original
-- assignments aren't recoverable, which is acceptable for a down migration).
insert into public.roles (key, level, name, is_admin) values
  ('manager', 2, 'Manager', false),
  ('bd_lead', 3, 'BD Lead', false),
  ('viewer', 5, 'Viewer', false)
on conflict (key) do nothing;
