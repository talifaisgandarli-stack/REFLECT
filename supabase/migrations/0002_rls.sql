-- Row-Level Security — every canonical table per PRD §9.1.
-- All policies use is_admin() helper (defined in 0001) and auth.uid().

-- Helper: user is project member (assigned to any task or created the project)
create or replace function public.is_project_member(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    exists (select 1 from projects where id = p and created_by = auth.uid())
    or exists (
      select 1 from tasks t
      where t.project_id = p and auth.uid() = any(t.assignee_ids)
    );
$$;

-- ----------------------------------------------------------------------------
-- profiles, roles, invitations
-- ----------------------------------------------------------------------------
alter table profiles enable row level security;
create policy profiles_select on profiles for select using (auth.role() = 'authenticated');
create policy profiles_update_self on profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);
create policy profiles_admin_all on profiles for all
  using (is_admin()) with check (is_admin());

alter table roles enable row level security;
create policy roles_select on roles for select using (auth.role() = 'authenticated');
create policy roles_admin_write on roles for all using (is_admin()) with check (is_admin());

alter table invitations enable row level security;
create policy invitations_admin_only on invitations for all
  using (is_admin()) with check (is_admin());

-- ----------------------------------------------------------------------------
-- Work
-- ----------------------------------------------------------------------------
alter table projects enable row level security;
create policy projects_select on projects for select
  using (is_admin() or is_project_member(id));
create policy projects_admin_write on projects for all
  using (is_admin()) with check (is_admin());

alter table tasks enable row level security;
create policy tasks_select on tasks for select
  using (is_admin() or auth.uid() = any(assignee_ids) or is_project_member(project_id));
create policy tasks_insert on tasks for insert
  with check (is_admin() or is_project_member(project_id));
create policy tasks_update on tasks for update
  using (is_admin() or auth.uid() = any(assignee_ids));

alter table task_status_history enable row level security;
create policy tsh_select on task_status_history for select using (
  is_admin() or exists (select 1 from tasks t where t.id = task_id
    and (auth.uid() = any(t.assignee_ids) or is_project_member(t.project_id)))
);
create policy tsh_insert on task_status_history for insert with check (auth.role() = 'authenticated');

alter table task_comments enable row level security;
create policy tc_select on task_comments for select using (
  is_admin() or exists (select 1 from tasks t where t.id = task_id
    and (auth.uid() = any(t.assignee_ids) or is_project_member(t.project_id)))
);
create policy tc_insert on task_comments for insert with check (user_id = auth.uid());
create policy tc_update_own on task_comments for update using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Clients (admin + bd_lead)
-- ----------------------------------------------------------------------------
create or replace function public.is_bd_lead()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p join roles r on r.id = p.role_id
    where p.id = auth.uid() and r.key = 'bd_lead'
  );
$$;

alter table clients enable row level security;
create policy clients_select on clients for select using (is_admin() or is_bd_lead());
create policy clients_admin_write on clients for all using (is_admin()) with check (is_admin());

alter table client_stage_history enable row level security;
create policy csh_select on client_stage_history for select using (is_admin() or is_bd_lead());
create policy csh_admin_write on client_stage_history for all using (is_admin()) with check (is_admin());

alter table client_interactions enable row level security;
create policy ci_select on client_interactions for select using (is_admin() or is_bd_lead());
create policy ci_insert on client_interactions for insert with check (is_admin() or is_bd_lead());

-- ----------------------------------------------------------------------------
-- Finance (admin only — PRD §9.1)
-- ----------------------------------------------------------------------------
alter table incomes enable row level security;
create policy incomes_admin on incomes for all using (is_admin()) with check (is_admin());

alter table expenses enable row level security;
create policy expenses_admin on expenses for all using (is_admin()) with check (is_admin());

alter table recurring_expenses enable row level security;
create policy rec_exp_admin on recurring_expenses for all using (is_admin()) with check (is_admin());

alter table outsource_items enable row level security;
create policy outsource_admin on outsource_items for all using (is_admin()) with check (is_admin());

alter table receivables enable row level security;
create policy receivables_admin on receivables for all using (is_admin()) with check (is_admin());

alter table cash_forecasts enable row level security;
create policy cash_forecasts_admin on cash_forecasts for select using (is_admin());

-- View that exposes outsource without money fields — granted to authenticated.
create or replace view outsource_user_view as
  select id, project_id, work_title, contact_person, deadline, status, responsible_user_id
  from outsource_items;
grant select on outsource_user_view to authenticated;

-- View: projects without financial columns (placeholder — projects has no $ cols
-- yet; budget fields land in v1.5). User view = same row set for non-admins.
create or replace view projects_user_view as
  select id, name, client_id, phases, requires_expertise, expertise_deadline,
         deadline, start_date, status, created_by, created_at, archived_at
  from projects;
grant select on projects_user_view to authenticated;

-- ----------------------------------------------------------------------------
-- Documents
-- ----------------------------------------------------------------------------
alter table project_documents enable row level security;
create policy pd_select on project_documents for select
  using (is_admin() or (project_id is not null and is_project_member(project_id)));
create policy pd_admin_write on project_documents for all
  using (is_admin()) with check (is_admin());

alter table templates enable row level security;
create policy templates_select on templates for select using (auth.role() = 'authenticated');
create policy templates_admin_write on templates for all using (is_admin()) with check (is_admin());

alter table retrospective_surveys enable row level security;
create policy rs_select on retrospective_surveys for select
  using (is_admin() or (project_id is not null and is_project_member(project_id)));

alter table closeout_checklists enable row level security;
create policy cc_select on closeout_checklists for select
  using (is_admin() or is_project_member(project_id));

alter table portfolio_workflows enable row level security;
create policy pw_select on portfolio_workflows for select
  using (is_admin() or is_project_member(project_id));

alter table system_awards enable row level security;
create policy sa_select on system_awards for select using (auth.role() = 'authenticated');
create policy sa_admin on system_awards for all using (is_admin()) with check (is_admin());

-- ----------------------------------------------------------------------------
-- Communication
-- ----------------------------------------------------------------------------
alter table announcements enable row level security;
create policy ann_select on announcements for select
  using (auth.role() = 'authenticated' and (approved or created_by = auth.uid() or is_admin()));
create policy ann_insert on announcements for insert
  with check (auth.role() = 'authenticated');
create policy ann_admin on announcements for update using (is_admin()) with check (is_admin());

alter table calendar_events enable row level security;
create policy ce_select on calendar_events for select
  using (auth.role() = 'authenticated' and (
    organizer_id = auth.uid() or auth.uid() = any(attendees) or is_admin()
  ));
create policy ce_insert on calendar_events for insert with check (organizer_id = auth.uid() or is_admin());
create policy ce_update on calendar_events for update using (organizer_id = auth.uid() or is_admin());

alter table notifications enable row level security;
create policy notif_self on notifications for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- AI
-- ----------------------------------------------------------------------------
alter table mirai_conversations enable row level security;
create policy mc_self on mirai_conversations for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table mirai_messages enable row level security;
create policy mm_self on mirai_messages for all using (
  exists (select 1 from mirai_conversations c where c.id = conversation_id and c.user_id = auth.uid())
);

alter table mirai_usage_log enable row level security;
create policy mul_self on mirai_usage_log for select using (user_id = auth.uid() or is_admin());

alter table knowledge_base enable row level security;
create policy kb_select on knowledge_base for select using (auth.role() = 'authenticated');
create policy kb_admin_write on knowledge_base for all using (is_admin()) with check (is_admin());

alter table mirai_feed_posts enable row level security;
create policy mfp_select on mirai_feed_posts for select using (auth.role() = 'authenticated');
create policy mfp_admin on mirai_feed_posts for all using (is_admin()) with check (is_admin());

-- ----------------------------------------------------------------------------
-- System
-- ----------------------------------------------------------------------------
alter table okrs enable row level security;
create policy okrs_select on okrs for select using (
  is_admin() or scope = 'company' or employee_id = auth.uid() or owner_id = auth.uid()
);
create policy okrs_self_write on okrs for all using (
  is_admin() or (scope = 'personal' and employee_id = auth.uid())
) with check (
  is_admin() or (scope = 'personal' and employee_id = auth.uid())
);

alter table key_results enable row level security;
create policy kr_select on key_results for select using (
  exists (select 1 from okrs o where o.id = okr_id and (
    is_admin() or o.scope = 'company' or o.employee_id = auth.uid() or o.owner_id = auth.uid()
  ))
);
create policy kr_write on key_results for all using (
  exists (select 1 from okrs o where o.id = okr_id and (
    is_admin() or o.employee_id = auth.uid()
  ))
);

alter table system_settings enable row level security;
create policy ss_select on system_settings for select using (auth.role() = 'authenticated');
create policy ss_admin on system_settings for all using (is_admin()) with check (is_admin());

alter table activity_log enable row level security;
create policy al_select on activity_log for select using (auth.role() = 'authenticated');
create policy al_insert on activity_log for insert with check (auth.role() = 'authenticated');

alter table audit_log enable row level security;
create policy audit_admin on audit_log for select using (is_admin());

alter table equipment enable row level security;
create policy eq_select on equipment for select using (auth.role() = 'authenticated');
create policy eq_admin on equipment for all using (is_admin()) with check (is_admin());

-- ----------------------------------------------------------------------------
-- Presence + Focus
-- ----------------------------------------------------------------------------
alter table user_presence enable row level security;
create policy up_select on user_presence for select using (auth.role() = 'authenticated');
create policy up_self on user_presence for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table focus_sessions enable row level security;
create policy fs_self on focus_sessions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
