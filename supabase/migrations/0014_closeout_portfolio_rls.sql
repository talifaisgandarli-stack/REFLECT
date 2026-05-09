-- Closeout + Portfolio write policies — REQ-PROJ-04 + REQ-PROJ-05.
--
-- The 0002 migration only granted SELECT on closeout_checklists and
-- portfolio_workflows. To let admins/project-members fill out the checklist
-- and pick awards we need INSERT/UPDATE policies. Members may write their
-- own project's rows; admins write anywhere.

create policy cc_write on closeout_checklists for all
  using (is_admin() or is_project_member(project_id))
  with check (is_admin() or is_project_member(project_id));

create policy pw_write on portfolio_workflows for all
  using (is_admin() or is_project_member(project_id))
  with check (is_admin() or is_project_member(project_id));
