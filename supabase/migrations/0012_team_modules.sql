-- 0012_team_modules.sql
-- Creates 5 tables missing from earlier migrations + fixes public RLS gaps.
-- PRD refs: §8.3 (performance_reviews), §8.4 (leave_requests),
--           §9.2 (career_levels), §9.3 (content_plans), §7.9 (mirai_feedback).

-- ============================================================================
-- §8.4 Leave requests
-- ============================================================================
create type leave_status as enum ('pending', 'approved', 'denied');

create table if not exists leave_requests (
  id            uuid        primary key default uuid_generate_v4(),
  employee_id   uuid        not null references profiles(id) on delete cascade,
  kind          text        not null,
  starts_at     date        not null,
  ends_at       date        not null,
  days          int         not null check (days > 0),
  status        leave_status not null default 'pending',
  approver_id   uuid        references profiles(id),
  note          text,
  created_at    timestamptz not null default now(),
  constraint lr_dates_ok check (ends_at >= starts_at)
);

create index if not exists idx_leave_employee on leave_requests(employee_id, created_at desc);
create index if not exists idx_leave_status   on leave_requests(status);

alter table leave_requests enable row level security;

-- Users see own requests; admins see all.
create policy lr_self_select on leave_requests for select
  using (employee_id = auth.uid() or is_admin());

-- Any authenticated user can submit a request for themselves.
create policy lr_self_insert on leave_requests for insert
  with check (employee_id = auth.uid());

-- Admins update status (approve / deny).
create policy lr_admin_update on leave_requests for update
  using (is_admin()) with check (is_admin());

-- ============================================================================
-- §8.3 Performance reviews
-- ============================================================================
create table if not exists performance_reviews (
  id            uuid        primary key default uuid_generate_v4(),
  employee_id   uuid        not null references profiles(id) on delete cascade,
  year          int         not null,
  score         int         not null check (score between 0 and 100),
  ratings       jsonb       not null default '{}'::jsonb,
  reviewer_id   uuid        references profiles(id),
  summary       text,
  created_at    timestamptz not null default now(),
  unique (employee_id, year)
);

create index if not exists idx_perf_employee on performance_reviews(employee_id, year desc);

alter table performance_reviews enable row level security;

-- Users see own reviews; admins see all.
create policy pr_self_select on performance_reviews for select
  using (employee_id = auth.uid() or is_admin());

-- Only admins can create / update reviews.
create policy pr_admin_write on performance_reviews for all
  using (is_admin()) with check (is_admin());

-- ============================================================================
-- §9.2 Career levels
-- ============================================================================
create table if not exists career_levels (
  id            uuid        primary key default uuid_generate_v4(),
  name          text        not null,
  level_index   int         not null unique,
  requirements  jsonb       not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

alter table career_levels enable row level security;

-- All authenticated users can read career levels.
create policy cl_select on career_levels for select
  using (auth.role() = 'authenticated');

-- Admins manage the ladder.
create policy cl_admin_write on career_levels for all
  using (is_admin()) with check (is_admin());

-- ============================================================================
-- §9.3 Content plans
-- ============================================================================
create type content_status as enum ('idea', 'draft', 'review', 'published');

create table if not exists content_plans (
  id            uuid           primary key default uuid_generate_v4(),
  channel       text           not null,
  scheduled_at  timestamptz,
  topic         text           not null,
  owner_id      uuid           references profiles(id),
  status        content_status not null default 'idea',
  body          text,
  created_at    timestamptz    not null default now()
);

create index if not exists idx_cp_status on content_plans(status);

alter table content_plans enable row level security;

-- Admin-only per PRD §9.3.
create policy cp_admin on content_plans for all
  using (is_admin()) with check (is_admin());

-- ============================================================================
-- §7.9 MIRAI feedback (thumbs up/down per assistant message)
-- ============================================================================
create table if not exists mirai_feedback (
  id               uuid  primary key default uuid_generate_v4(),
  user_id          uuid  references profiles(id) on delete cascade,
  conversation_id  uuid  references mirai_conversations(id) on delete cascade,
  message_id       uuid  references mirai_messages(id) on delete cascade,
  message_index    int,
  vote             text  not null check (vote in ('up', 'down')),
  created_at       timestamptz not null default now(),
  -- One vote per user per message position in a conversation.
  unique (user_id, conversation_id, message_index)
);

alter table mirai_feedback enable row level security;

create policy mf_self_insert on mirai_feedback for insert
  with check (user_id = auth.uid());

create policy mf_self_select on mirai_feedback for select
  using (user_id = auth.uid() or is_admin());

-- ============================================================================
-- Fix: public read for shared project_documents (REQ-CRM-06 / /docs/:token)
-- The existing policy only covers authenticated project members. Anon users
-- opening a share link must be able to SELECT by share_token.
-- ============================================================================
-- Allow anonymous + authenticated reads when a share_token is present.
create policy pd_public_share on project_documents for select
  using (share_token is not null);

-- ============================================================================
-- Fix: public read for retrospective_surveys (REQ-CRM-07 / /retro/:token)
-- The existing rs_select policy blocks anon users on the public survey form.
-- ============================================================================
drop policy if exists rs_select on retrospective_surveys;

-- Admins and project members see all rows; anyone can read by share_token (public form).
create policy rs_select on retrospective_surveys for select
  using (
    is_admin()
    or (project_id is not null and is_project_member(project_id))
    or share_token is not null
  );

-- Allow anonymous insert for survey responses (public form submit).
create policy rs_public_respond on retrospective_surveys for update
  using (share_token is not null and responded_at is null)
  with check (share_token is not null);
