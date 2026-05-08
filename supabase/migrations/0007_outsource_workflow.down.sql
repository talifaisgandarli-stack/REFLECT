drop function if exists public.update_outsource_status(uuid, outsource_status);

-- Restore the 0002 form of the view (with contact_person).
create or replace view outsource_user_view as
  select id, project_id, work_title, contact_person, deadline, status, responsible_user_id
  from outsource_items;
grant select on outsource_user_view to authenticated;
