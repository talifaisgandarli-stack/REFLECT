-- Reverse of 0004_activity_triggers.sql
drop trigger if exists tasks_block_done on tasks;
drop function if exists public.tasks_block_done_with_open_children();

drop trigger if exists task_comments_notify on task_comments;
drop function if exists public.task_comments_notify_mentions();

drop trigger if exists task_comments_parse_mentions on task_comments;
drop function if exists public.parse_task_comment_mentions();

drop trigger if exists clients_activity on clients;
drop function if exists public.clients_activity_trg();

drop trigger if exists projects_activity on projects;
drop function if exists public.projects_activity_trg();

drop trigger if exists tasks_activity on tasks;
drop function if exists public.tasks_activity_trg();

drop function if exists public.log_activity(text, uuid, text, text, jsonb, jsonb);
