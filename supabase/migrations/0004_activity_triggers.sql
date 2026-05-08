-- Universal activity log + mention parser
-- PRD §6.1 (Universal Activity Log), REQ-TASK-07 (mention parser).
-- All triggers fail-open (raise warning, never block writes).

-- ---------------------------------------------------------------------------
-- Helper: insert one activity row with current actor (auth.uid() or NULL)
-- ---------------------------------------------------------------------------
create or replace function public.log_activity(
  p_entity_type text,
  p_entity_id uuid,
  p_action text,
  p_field text default null,
  p_old jsonb default null,
  p_new jsonb default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into activity_log (entity_type, entity_id, user_id, action, field_name, old_value, new_value)
  values (p_entity_type, p_entity_id, auth.uid(), p_action, p_field, p_old, p_new);
exception when others then
  raise warning 'log_activity failed: %', sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------
-- tasks: status / deadline / assignee_ids changes + creates
-- ---------------------------------------------------------------------------
create or replace function public.tasks_activity_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform log_activity('task', new.id, 'created', null, null, to_jsonb(new));
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      perform log_activity('task', new.id, 'status_changed', 'status',
        to_jsonb(old.status), to_jsonb(new.status));
      insert into task_status_history (task_id, from_status, to_status, changed_by)
        values (new.id, old.status, new.status, auth.uid());
    end if;
    if new.deadline is distinct from old.deadline then
      perform log_activity('task', new.id, 'deadline_changed', 'deadline',
        to_jsonb(old.deadline), to_jsonb(new.deadline));
    end if;
    if new.assignee_ids is distinct from old.assignee_ids then
      perform log_activity('task', new.id, 'assignees_changed', 'assignee_ids',
        to_jsonb(old.assignee_ids), to_jsonb(new.assignee_ids));
    end if;
    if new.archived_at is distinct from old.archived_at and new.archived_at is not null then
      perform log_activity('task', new.id, 'archived');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_activity on tasks;
create trigger tasks_activity
  after insert or update on tasks
  for each row execute function public.tasks_activity_trg();

-- ---------------------------------------------------------------------------
-- projects: create + status / phases changes
-- ---------------------------------------------------------------------------
create or replace function public.projects_activity_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform log_activity('project', new.id, 'created', null, null, to_jsonb(new));
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      perform log_activity('project', new.id, 'status_changed', 'status',
        to_jsonb(old.status), to_jsonb(new.status));
    end if;
    if new.phases is distinct from old.phases then
      perform log_activity('project', new.id, 'phases_changed', 'phases',
        to_jsonb(old.phases), to_jsonb(new.phases));
    end if;
    if new.deadline is distinct from old.deadline then
      perform log_activity('project', new.id, 'deadline_changed', 'deadline',
        to_jsonb(old.deadline), to_jsonb(new.deadline));
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists projects_activity on projects;
create trigger projects_activity
  after insert or update on projects
  for each row execute function public.projects_activity_trg();

-- ---------------------------------------------------------------------------
-- clients: pipeline stage changes (REQ-CRM-01)
-- ---------------------------------------------------------------------------
create or replace function public.clients_activity_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform log_activity('client', new.id, 'created');
  elsif tg_op = 'UPDATE' and new.pipeline_stage is distinct from old.pipeline_stage then
    perform log_activity('client', new.id, 'stage_changed', 'pipeline_stage',
      to_jsonb(old.pipeline_stage), to_jsonb(new.pipeline_stage));
    insert into client_stage_history (client_id, from_stage, to_stage, changed_by)
      values (new.id, old.pipeline_stage, new.pipeline_stage, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists clients_activity on clients;
create trigger clients_activity
  after insert or update on clients
  for each row execute function public.clients_activity_trg();

-- ---------------------------------------------------------------------------
-- task_comments: parse @<uuid> mentions, populate mentions[]  (REQ-TASK-07)
-- ---------------------------------------------------------------------------
create or replace function public.parse_task_comment_mentions()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uuid_re text :=
    '@([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
  m text[];
begin
  -- Collect all @<uuid> matches, dedupe, ignore mentions that aren't real users.
  with matches as (
    select distinct (regexp_matches(coalesce(new.body, ''), uuid_re, 'g'))[1]::uuid as id
  )
  select array_agg(id)
    into m
    from matches
   where exists (select 1 from profiles p where p.id = matches.id);

  new.mentions := coalesce(m, array[]::uuid[]);
  return new;
end;
$$;

drop trigger if exists task_comments_parse_mentions on task_comments;
create trigger task_comments_parse_mentions
  before insert or update of body on task_comments
  for each row execute function public.parse_task_comment_mentions();

-- ---------------------------------------------------------------------------
-- task_comments + mentions → notifications fan-out
-- ---------------------------------------------------------------------------
create or replace function public.task_comments_notify_mentions()
returns trigger language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  perform log_activity('task_comment', new.task_id, 'commented', null, null,
    jsonb_build_object('mentions', new.mentions));
  if array_length(new.mentions, 1) is null then
    return new;
  end if;
  foreach uid in array new.mentions loop
    if uid <> new.user_id then
      insert into notifications (user_id, kind, payload)
      values (uid, 'mention',
        jsonb_build_object('task_id', new.task_id, 'comment_id', new.id, 'by', new.user_id));
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists task_comments_notify on task_comments;
create trigger task_comments_notify
  after insert on task_comments
  for each row execute function public.task_comments_notify_mentions();

-- ---------------------------------------------------------------------------
-- Subtask → Done blocking (REQ-TASK-05)
-- ---------------------------------------------------------------------------
-- DB enforces what the modal communicates: a parent cannot move to 'done'
-- while any child is still open. The modal in the UI shows blockers and
-- offers "Hamısını tamamla" — but the DB is the final guard.
create or replace function public.tasks_block_done_with_open_children()
returns trigger language plpgsql security definer set search_path = public as $$
declare open_n int;
begin
  if new.status = 'done' and (old.status is null or old.status <> 'done') then
    select count(*) into open_n
      from tasks
     where parent_task_id = new.id
       and archived_at is null
       and status not in ('done', 'cancelled');
    if open_n > 0 then
      raise exception 'task_has_open_children: % open child task(s)', open_n
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_block_done on tasks;
create trigger tasks_block_done
  before update on tasks
  for each row execute function public.tasks_block_done_with_open_children();
