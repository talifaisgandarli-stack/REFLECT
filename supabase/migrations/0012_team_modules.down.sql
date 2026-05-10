-- Rollback 0012_team_modules.sql

drop policy if exists rs_public_respond on retrospective_surveys;
drop policy if exists rs_select on retrospective_surveys;
create policy rs_select on retrospective_surveys for select
  using (is_admin() or (project_id is not null and is_project_member(project_id)));

drop policy if exists pd_public_share on project_documents;

drop table if exists mirai_feedback;
drop table if exists content_plans;
drop type  if exists content_status;
drop table if exists career_levels;
drop table if exists performance_reviews;
drop table if exists leave_requests;
drop type  if exists leave_status;
