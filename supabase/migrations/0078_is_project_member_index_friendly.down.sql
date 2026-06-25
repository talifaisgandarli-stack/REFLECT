-- Restore the original (functionally identical) is_project_member() body.
create or replace function public.is_project_member(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    exists (select 1 from projects where id = p and created_by = auth.uid())
    or exists (
      select 1 from tasks t
      where t.project_id = p and auth.uid() = any(t.assignee_ids)
    );
$$;
