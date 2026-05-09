drop view if exists outsource_user_view;
drop view if exists projects_user_view;
drop view if exists projects_admin_view;
drop table if exists content_plans cascade;
drop table if exists career_levels cascade;
drop trigger if exists leave_approve_calendar on leave_requests;
drop function if exists public.leave_approve_calendar();
drop table if exists leave_requests cascade;
drop table if exists performance_reviews cascade;
