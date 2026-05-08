-- Reverse of 0002_rls.sql. Disables RLS and drops policies + helpers + views.
-- WARNING per PRD §10.2: this is reversal, not destruction. Schema (0001) is untouched.

drop view if exists projects_user_view;
drop view if exists outsource_user_view;

drop function if exists public.is_bd_lead();
drop function if exists public.is_project_member(uuid);

-- Profiles / roles / invitations
drop policy if exists profiles_select on profiles;
drop policy if exists profiles_update_self on profiles;
drop policy if exists profiles_admin_all on profiles;
drop policy if exists roles_select on roles;
drop policy if exists roles_admin_write on roles;
drop policy if exists invitations_admin_only on invitations;
alter table profiles disable row level security;
alter table roles disable row level security;
alter table invitations disable row level security;

-- Work
drop policy if exists projects_select on projects;
drop policy if exists projects_admin_write on projects;
drop policy if exists tasks_select on tasks;
drop policy if exists tasks_insert on tasks;
drop policy if exists tasks_update on tasks;
drop policy if exists tsh_select on task_status_history;
drop policy if exists tsh_insert on task_status_history;
drop policy if exists tc_select on task_comments;
drop policy if exists tc_insert on task_comments;
drop policy if exists tc_update_own on task_comments;
alter table projects disable row level security;
alter table tasks disable row level security;
alter table task_status_history disable row level security;
alter table task_comments disable row level security;

-- Clients
drop policy if exists clients_select on clients;
drop policy if exists clients_admin_write on clients;
drop policy if exists csh_select on client_stage_history;
drop policy if exists csh_admin_write on client_stage_history;
drop policy if exists ci_select on client_interactions;
drop policy if exists ci_insert on client_interactions;
alter table clients disable row level security;
alter table client_stage_history disable row level security;
alter table client_interactions disable row level security;

-- Finance
drop policy if exists incomes_admin on incomes;
drop policy if exists expenses_admin on expenses;
drop policy if exists rec_exp_admin on recurring_expenses;
drop policy if exists outsource_admin on outsource_items;
drop policy if exists receivables_admin on receivables;
drop policy if exists cash_forecasts_admin on cash_forecasts;
alter table incomes disable row level security;
alter table expenses disable row level security;
alter table recurring_expenses disable row level security;
alter table outsource_items disable row level security;
alter table receivables disable row level security;
alter table cash_forecasts disable row level security;

-- Documents
drop policy if exists pd_select on project_documents;
drop policy if exists pd_admin_write on project_documents;
drop policy if exists templates_select on templates;
drop policy if exists templates_admin_write on templates;
drop policy if exists rs_select on retrospective_surveys;
drop policy if exists cc_select on closeout_checklists;
drop policy if exists pw_select on portfolio_workflows;
drop policy if exists sa_select on system_awards;
drop policy if exists sa_admin on system_awards;
alter table project_documents disable row level security;
alter table templates disable row level security;
alter table retrospective_surveys disable row level security;
alter table closeout_checklists disable row level security;
alter table portfolio_workflows disable row level security;
alter table system_awards disable row level security;

-- Communication
drop policy if exists ann_select on announcements;
drop policy if exists ann_insert on announcements;
drop policy if exists ann_admin on announcements;
drop policy if exists ce_select on calendar_events;
drop policy if exists ce_insert on calendar_events;
drop policy if exists ce_update on calendar_events;
drop policy if exists notif_self on notifications;
alter table announcements disable row level security;
alter table calendar_events disable row level security;
alter table notifications disable row level security;

-- AI
drop policy if exists mc_self on mirai_conversations;
drop policy if exists mm_self on mirai_messages;
drop policy if exists mul_self on mirai_usage_log;
drop policy if exists kb_select on knowledge_base;
drop policy if exists kb_admin_write on knowledge_base;
drop policy if exists mfp_select on mirai_feed_posts;
drop policy if exists mfp_admin on mirai_feed_posts;
alter table mirai_conversations disable row level security;
alter table mirai_messages disable row level security;
alter table mirai_usage_log disable row level security;
alter table knowledge_base disable row level security;
alter table mirai_feed_posts disable row level security;

-- System
drop policy if exists okrs_select on okrs;
drop policy if exists okrs_self_write on okrs;
drop policy if exists kr_select on key_results;
drop policy if exists kr_write on key_results;
drop policy if exists ss_select on system_settings;
drop policy if exists ss_admin on system_settings;
drop policy if exists al_select on activity_log;
drop policy if exists al_insert on activity_log;
drop policy if exists audit_admin on audit_log;
drop policy if exists eq_select on equipment;
drop policy if exists eq_admin on equipment;
alter table okrs disable row level security;
alter table key_results disable row level security;
alter table system_settings disable row level security;
alter table activity_log disable row level security;
alter table audit_log disable row level security;
alter table equipment disable row level security;

-- Presence + Focus
drop policy if exists up_select on user_presence;
drop policy if exists up_self on user_presence;
drop policy if exists fs_self on focus_sessions;
alter table user_presence disable row level security;
alter table focus_sessions disable row level security;
