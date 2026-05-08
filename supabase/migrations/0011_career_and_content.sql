-- Module 9.2 + 9.3 schema — PRD §3.2 / §9.2 / §9.3.
--
-- Both tables were enumerated in PRD §9.2 / §9.3 but absent from 0001
-- _init_schema.sql. This migration completes what PRD already promised;
-- not a new product decision (logged in commit body per PRD-guard rule 5).

-- 9.2 Karyera Strukturu
create table if not exists career_levels (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  level_index int not null,
  requirements jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create unique index if not exists career_levels_index_unique on career_levels(level_index);

alter table career_levels enable row level security;
-- Read: any authenticated user (PRD §9.2 "users read"). Write: admin only.
create policy career_select on career_levels
  for select using (auth.role() = 'authenticated');
create policy career_admin_write on career_levels
  for all using (is_admin()) with check (is_admin());

-- 9.3 Məzmun Planlaması
create type content_plan_status as enum ('idea', 'draft', 'review', 'published');
create type content_channel as enum (
  'instagram', 'linkedin', 'facebook', 'website', 'newsletter', 'other'
);

create table if not exists content_plans (
  id uuid primary key default uuid_generate_v4(),
  channel content_channel not null,
  scheduled_at timestamptz,
  topic text not null,
  owner_id uuid references profiles(id) on delete set null,
  status content_plan_status not null default 'idea',
  body text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_content_plans_status on content_plans(status);
create index if not exists idx_content_plans_scheduled on content_plans(scheduled_at);

alter table content_plans enable row level security;
-- PRD §9.3 says "admin only". Both read AND write locked to admin.
create policy content_plans_admin on content_plans
  for all using (is_admin()) with check (is_admin());
