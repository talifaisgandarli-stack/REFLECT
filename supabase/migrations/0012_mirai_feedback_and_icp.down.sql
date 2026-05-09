alter table clients drop column if exists ai_icp_fit;
alter table clients rename column _deprecated_ai_icp_fit to ai_icp_fit;
drop table if exists mirai_feedback cascade;
