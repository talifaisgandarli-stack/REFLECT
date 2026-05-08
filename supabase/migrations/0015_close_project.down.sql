drop function if exists public.close_project(uuid, jsonb);
drop policy if exists pw_admin_write on portfolio_workflows;
drop policy if exists cc_admin_write on closeout_checklists;
