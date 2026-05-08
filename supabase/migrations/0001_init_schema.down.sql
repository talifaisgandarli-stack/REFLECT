-- Reverse of 0001_init_schema.sql.
-- PRD §10.2 forbids DROP TABLE in production paths. This file exists ONLY for
-- local dev resets and CI parity tests. Real rollbacks rename to _archived_*.
-- Apply 0002_rls.down.sql FIRST (drops the views that depend on these tables).

drop table if exists focus_sessions cascade;
drop table if exists user_presence cascade;
drop type if exists presence_status;

drop table if exists equipment cascade;
drop table if exists audit_log cascade;
drop table if exists activity_log cascade;
drop table if exists system_settings cascade;
drop table if exists key_results cascade;
drop table if exists okrs cascade;
drop type if exists okr_scope;

drop table if exists mirai_feed_posts cascade;
drop type if exists feed_source_kind;
drop table if exists knowledge_base cascade;
drop table if exists mirai_usage_log cascade;
drop table if exists mirai_messages cascade;
drop table if exists mirai_conversations cascade;
drop type if exists mirai_persona;

drop table if exists notifications cascade;
drop table if exists calendar_events cascade;
drop table if exists announcements cascade;

drop table if exists system_awards cascade;
drop table if exists portfolio_workflows cascade;
drop table if exists closeout_checklists cascade;
drop table if exists retrospective_surveys cascade;
drop table if exists templates cascade;
drop table if exists project_documents cascade;
drop type if exists document_source;

drop table if exists cash_forecasts cascade;
drop table if exists receivables cascade;
drop type if exists receivable_status;
drop table if exists outsource_items cascade;
drop type if exists outsource_status;
drop table if exists expenses cascade;
drop table if exists incomes cascade;
drop table if exists recurring_expenses cascade;

drop table if exists client_interactions cascade;
drop table if exists client_stage_history cascade;
drop table if exists clients cascade;
drop type if exists client_pipeline_stage;

drop table if exists task_comments cascade;
drop table if exists task_status_history cascade;
drop table if exists tasks cascade;
drop type if exists task_status;
drop table if exists projects cascade;
drop type if exists project_status;

drop function if exists public.is_admin();

drop table if exists invitations cascade;
drop table if exists profiles cascade;
drop table if exists roles cascade;
