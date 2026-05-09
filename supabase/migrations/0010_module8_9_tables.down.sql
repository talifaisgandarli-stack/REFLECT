-- Rollback for 0010 — Module 8/9 tables (PRD §3.2 / §8 / §9).

drop trigger if exists trg_salaries_log on salaries;
drop trigger if exists trg_leave_log on leave_requests;
drop trigger if exists trg_content_log on content_plans;
drop function if exists simple_log_trg();

drop policy if exists sal_self on salaries;
drop policy if exists sal_admin on salaries;
drop policy if exists perf_self on performance_reviews;
drop policy if exists perf_admin on performance_reviews;
drop policy if exists leave_select on leave_requests;
drop policy if exists leave_insert_self on leave_requests;
drop policy if exists leave_admin_update on leave_requests;
drop policy if exists cl_select on career_levels;
drop policy if exists cl_admin on career_levels;
drop policy if exists cp_admin on content_plans;

drop table if exists content_plans cascade;
drop type if exists content_status;
drop table if exists career_levels cascade;
drop table if exists leave_requests cascade;
drop type if exists leave_status;
drop type if exists leave_kind;
drop table if exists performance_reviews cascade;
drop table if exists salaries cascade;
