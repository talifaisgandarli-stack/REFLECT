create or replace view public.outsource_user_view as
  select id, project_id, work_title, contact_person, deadline, status, responsible_user_id
  from public.outsource_items;
grant select on public.outsource_user_view to authenticated;

alter table public.outsource_items
  drop column if exists discipline,
  drop column if exists advance_pct,
  drop column if exists paid_amount,
  drop column if exists interim_count;
