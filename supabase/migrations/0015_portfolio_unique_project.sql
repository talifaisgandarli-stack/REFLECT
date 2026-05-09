-- Required for portfolio_workflows upsert(onConflict='project_id') — REQ-PROJ-04/05.
alter table portfolio_workflows
  add constraint portfolio_workflows_project_id_uk unique (project_id);
