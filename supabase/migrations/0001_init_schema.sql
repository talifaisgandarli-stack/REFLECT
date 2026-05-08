-- Reflect Architects OS — initial schema
-- PRD §3.2 canonical table list. Every table has RLS in 0002_rls.sql.
-- DO NOT drop columns directly; rename to _deprecated_* per PRD §10.2.

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- ============================================================================
-- Identity & access
-- ============================================================================
create table if not exists roles (
  id uuid primary key default uuid_generate_v4(),
  key text not null unique,
  level int not null,
  name text not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

insert into roles (key, level, name, is_admin) values
  ('creator', 0, 'Creator', true),
  ('admin', 1, 'Admin', true),
  ('manager', 2, 'Manager', false),
  ('bd_lead', 3, 'BD Lead', false),
  ('member', 4, 'Member', false),
  ('viewer', 5, 'Viewer', false)
on conflict (key) do nothing;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  avatar_url text,
  role_id uuid references roles(id),
  is_creator boolean not null default false,
  is_active boolean not null default true,
  telegram_chat_id text,
  telegram_linked_at timestamptz,
  locale text not null default 'az',
  created_at timestamptz not null default now()
);

create table if not exists invitations (
  id uuid primary key default uuid_generate_v4(),
  email text not null,
  role_id uuid not null references roles(id),
  invited_by uuid references profiles(id),
  token text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_invitations_email on invitations(email);

-- Helper: is current user admin (role_id.is_admin = true OR is_creator)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.is_creator or r.is_admin
      from profiles p
      left join roles r on r.id = p.role_id
      where p.id = auth.uid()
    ),
    false
  );
$$;

-- ============================================================================
-- Work
-- ============================================================================
create type project_status as enum ('active', 'on_hold', 'closed', 'cancelled');

create table if not exists projects (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  client_id uuid,
  phases text[] not null default '{}',
  requires_expertise boolean not null default false,
  expertise_deadline date,
  payment_buffer_days int not null default 10,
  deadline date,
  start_date date,
  status project_status not null default 'active',
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  reopened_at timestamptz,
  -- Legacy column kept per §10.2 forbidden-operations rule (rename, never drop)
  _deprecated_phase text
);

create type task_status as enum (
  'idea', 'queued', 'active', 'review', 'expert', 'done', 'cancelled'
);

create table if not exists tasks (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade,
  title text not null,
  description text,
  status task_status not null default 'queued',
  parent_task_id uuid references tasks(id) on delete cascade,
  task_level int not null default 0,
  assignee_ids uuid[] not null default '{}',
  start_date date,
  deadline date,
  estimated_duration numeric,
  duration_unit text default 'hours',
  risk_buffer_pct int not null default 0,
  is_expertise_subtask boolean not null default false,
  workload numeric,
  workload_calculated_at timestamptz,
  cancel_reason text,
  archived_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  -- legacy
  _deprecated_assignee_id uuid,
  constraint chk_amount check (estimated_duration is null or estimated_duration >= 0)
);
create index if not exists idx_tasks_project on tasks(project_id);
create index if not exists idx_tasks_status on tasks(status);
create index if not exists idx_tasks_assignees on tasks using gin(assignee_ids);

create table if not exists task_status_history (
  id uuid primary key default uuid_generate_v4(),
  task_id uuid not null references tasks(id) on delete cascade,
  from_status task_status,
  to_status task_status not null,
  changed_by uuid references profiles(id),
  changed_at timestamptz not null default now()
);

create table if not exists task_comments (
  id uuid primary key default uuid_generate_v4(),
  task_id uuid not null references tasks(id) on delete cascade,
  user_id uuid not null references profiles(id),
  body text not null,
  mentions uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Clients / CRM
-- ============================================================================
create type client_pipeline_stage as enum (
  'lead', 'proposal', 'negotiation', 'signed', 'in_progress', 'portfolio', 'lost', 'archived'
);

create table if not exists clients (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  company text,
  email text,
  phone text,
  pipeline_stage client_pipeline_stage not null default 'lead',
  confidence_pct int not null default 10,
  expected_value numeric,
  last_interaction_at timestamptz,
  ai_icp_fit numeric,
  ai_icp_calculated_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

alter table projects add constraint fk_projects_client
  foreign key (client_id) references clients(id) on delete set null;

create table if not exists client_stage_history (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references clients(id) on delete cascade,
  from_stage client_pipeline_stage,
  to_stage client_pipeline_stage not null,
  changed_by uuid references profiles(id),
  changed_at timestamptz not null default now(),
  lost_reason text
);

create table if not exists client_interactions (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references clients(id) on delete cascade,
  type text not null check (type in ('call', 'email', 'meeting', 'whatsapp', 'other')),
  note text,
  occurred_at timestamptz not null default now(),
  logged_by uuid references profiles(id)
);

-- ============================================================================
-- Finance
-- ============================================================================
create table if not exists recurring_expenses (
  id uuid primary key default uuid_generate_v4(),
  label text not null,
  amount numeric not null check (amount > 0),
  period text not null check (period in ('weekly', 'monthly', 'quarterly', 'yearly')),
  next_run_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists incomes (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  amount numeric not null check (amount > 0),
  payment_method text,
  occurred_at timestamptz not null default now(),
  invoice_number text,
  note text,
  created_by uuid references profiles(id)
);

create table if not exists expenses (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete set null,
  category text,
  amount numeric not null check (amount > 0),
  vendor text,
  occurred_at timestamptz not null default now(),
  note text,
  created_by uuid references profiles(id),
  recurring_rule_id uuid references recurring_expenses(id) on delete set null
);

create type outsource_status as enum ('order', 'in_progress', 'delivered', 'paid');

create table if not exists outsource_items (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete set null,
  work_title text not null,
  contact_person text,
  contact_company text,
  amount numeric check (amount is null or amount > 0),
  paid_at timestamptz,
  payment_method text,
  responsible_user_id uuid references profiles(id),
  deadline date,
  status outsource_status not null default 'order',
  created_at timestamptz not null default now()
);

create type receivable_status as enum ('open', 'partial', 'paid', 'overdue');

create table if not exists receivables (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid references clients(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  amount numeric not null check (amount > 0),
  due_at date,
  paid_amount numeric not null default 0,
  status receivable_status not null default 'open',
  created_at timestamptz not null default now(),
  constraint chk_paid_lte_amount check (paid_amount <= amount)
);

create table if not exists cash_forecasts (
  id uuid primary key default uuid_generate_v4(),
  generated_at timestamptz not null default now(),
  horizon_days int not null check (horizon_days in (30, 60, 90)),
  projected_balance numeric not null,
  confidence_low numeric,
  confidence_high numeric,
  generated_by uuid references profiles(id)
);

-- ============================================================================
-- Documents
-- ============================================================================
create type document_source as enum ('drive_link', 'auto_generated', 'upload');

create table if not exists project_documents (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  category text,
  title text not null,
  source document_source not null,
  external_link text,
  storage_path text,
  share_token text unique,
  shared_with text[] not null default '{}',
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists templates (
  id uuid primary key default uuid_generate_v4(),
  category text not null,
  name text not null,
  body text,
  variables jsonb not null default '{}',
  mime_type text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists retrospective_surveys (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  share_token text unique,
  sent_at timestamptz,
  responded_at timestamptz,
  nps_score int check (nps_score between 0 and 10),
  ratings jsonb,
  comment text
);

create table if not exists closeout_checklists (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  items jsonb not null default '[]',
  completed_at timestamptz
);

create table if not exists portfolio_workflows (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  selected_awards uuid[] not null default '{}',
  website_published_at timestamptz,
  press_release_sent boolean not null default false,
  applications jsonb not null default '[]'
);

create table if not exists system_awards (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  organizer text,
  deadline_month int check (deadline_month between 1 and 12),
  url text,
  criteria text
);

-- ============================================================================
-- Communication
-- ============================================================================
create table if not exists announcements (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  body text,
  category text,
  cover_url text,
  is_featured boolean not null default false,
  mirai_generated boolean not null default false,
  approved boolean not null default false,
  approved_by uuid references profiles(id),
  created_by uuid references profiles(id),
  published_at timestamptz,
  read_by jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists calendar_events (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  recurrence_rule text,
  location text,
  meet_url text,
  organizer_id uuid references profiles(id),
  attendees uuid[] not null default '{}',
  external_emails text[] not null default '{}',
  project_id uuid references projects(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_user_unread
  on notifications(user_id) where read_at is null;

-- ============================================================================
-- AI (MIRAI)
-- ============================================================================
create type mirai_persona as enum (
  'general', 'project_manager', 'finance_analyst', 'cmo', 'hr_partner'
);

create table if not exists mirai_conversations (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  persona mirai_persona not null default 'general',
  started_at timestamptz not null default now(),
  last_message_at timestamptz,
  archived_at timestamptz
);

create table if not exists mirai_messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references mirai_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content text not null,
  tokens_in int not null default 0,
  tokens_out int not null default 0,
  cost_usd numeric not null default 0,
  tools_used jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table if not exists mirai_usage_log (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  period_yyyymm int not null,
  tokens_in int not null default 0,
  tokens_out int not null default 0,
  cost_usd numeric not null default 0,
  unique (user_id, period_yyyymm)
);

create table if not exists knowledge_base (
  id uuid primary key default uuid_generate_v4(),
  source_pdf text not null,
  chunk_index int not null,
  content text not null,
  embedding vector(1536),
  uploaded_by uuid references profiles(id),
  uploaded_at timestamptz not null default now()
);

create type feed_source_kind as enum ('trend', 'opportunity');

create table if not exists mirai_feed_posts (
  id uuid primary key default uuid_generate_v4(),
  source_url text not null,
  source_kind feed_source_kind not null,
  summary text,
  deadline_at timestamptz,
  fetched_at timestamptz not null default now(),
  posted_announcement_id uuid references announcements(id) on delete set null
);

-- ============================================================================
-- System
-- ============================================================================
create type okr_scope as enum ('company', 'personal');

create table if not exists okrs (
  id uuid primary key default uuid_generate_v4(),
  scope okr_scope not null,
  employee_id uuid references profiles(id) on delete cascade,
  period text not null,
  objective text not null,
  owner_id uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists key_results (
  id uuid primary key default uuid_generate_v4(),
  okr_id uuid not null references okrs(id) on delete cascade,
  title text not null,
  metric_type text,
  current_value numeric not null default 0,
  target_value numeric not null,
  unit text,
  updated_at timestamptz not null default now()
);

create table if not exists system_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);

create table if not exists activity_log (
  id uuid primary key default uuid_generate_v4(),
  entity_type text not null,
  entity_id uuid,
  user_id uuid references profiles(id),
  action text not null,
  field_name text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_activity_log_created_at on activity_log(created_at desc);
create index if not exists idx_activity_log_entity on activity_log(entity_type, entity_id);

create table if not exists audit_log (
  id uuid primary key default uuid_generate_v4(),
  actor_id uuid references profiles(id),
  action text not null,
  resource text,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists equipment (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  kind text,
  serial text,
  assigned_to uuid references profiles(id),
  condition text,
  purchased_at date,
  notes text
);

-- ============================================================================
-- Presence + Focus Mode (PRD §10.5)
-- ============================================================================
create type presence_status as enum ('online', 'away', 'offline');

create table if not exists user_presence (
  user_id uuid primary key references profiles(id) on delete cascade,
  status presence_status not null default 'offline',
  last_heartbeat_at timestamptz not null default now(),
  current_page text,
  session_type text default 'desktop'
);

create table if not exists focus_sessions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  planned_minutes int not null,
  completed_at timestamptz,
  interrupted boolean not null default false,
  mascot_stage int not null default 1
);
