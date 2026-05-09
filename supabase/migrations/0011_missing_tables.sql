-- 0011_missing_tables.sql
-- PRD §3.2 canonical tables + role-scoped views
-- Covers: Module 8.3 (performance_reviews), 8.4 (leave_requests),
--         9.2 (career_levels), 9.3 (content_plans),
--         projects_admin_view, projects_user_view, outsource_user_view

-- ---------------------------------------------------------------------------
-- 8.3 Performans — performance_reviews
-- PRD §8.3: (id, employee_id, year, score, ratings jsonb, reviewer_id, summary)
-- User sees self for all years; admin sees all.
-- ---------------------------------------------------------------------------
create table if not exists performance_reviews (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references profiles(id) on delete cascade,
  year int not null check (year >= 2026),
  score numeric not null check (score >= 0 and score <= 100),
  ratings jsonb not null default '{}'::jsonb,
  reviewer_id uuid references profiles(id),
  summary text,
  created_at timestamptz not null default now(),
  unique (employee_id, year)
);

create index if not exists idx_perf_employee on performance_reviews(employee_id, year desc);

alter table performance_reviews enable row level security;

create policy perf_self_select on performance_reviews for select
  using (employee_id = auth.uid());

create policy perf_admin_all on performance_reviews for all
  using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- 8.4 Məzuniyyət — leave_requests
-- PRD §8.4: (id, employee_id, kind, starts_at, ends_at, days, status, approver_id, note)
-- Workflow: pending → approved / denied
-- NOTE: PRD §8.4 does not enumerate leave kind values; using standard HR set.
-- ---------------------------------------------------------------------------
create table if not exists leave_requests (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('annual', 'sick', 'unpaid', 'parental', 'other')),
  starts_at date not null,
  ends_at date not null,
  days int not null generated always as (ends_at - starts_at + 1) stored,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  approver_id uuid references profiles(id),
  note text,
  created_at timestamptz not null default now(),
  constraint leave_dates_ok check (ends_at >= starts_at)
);

create index if not exists idx_leave_employee on leave_requests(employee_id, starts_at desc);
create index if not exists idx_leave_status on leave_requests(status) where status = 'pending';

alter table leave_requests enable row level security;

create policy leave_self_select on leave_requests for select
  using (employee_id = auth.uid());

create policy leave_self_insert on leave_requests for insert
  with check (employee_id = auth.uid());

create policy leave_admin_all on leave_requests for all
  using (is_admin()) with check (is_admin());

-- On approve: auto-create calendar_events row (PRD §8.4 US-LEAVE-02)
create or replace function public.leave_approve_calendar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE'
     and new.status = 'approved'
     and old.status = 'pending' then
    insert into calendar_events (
      title, starts_at, ends_at, all_day, organizer_id, attendees
    ) values (
      (select coalesce(full_name, email) || ' — məzuniyyət'
         from profiles where id = new.employee_id),
      new.starts_at::timestamptz,
      (new.ends_at + interval '1 day')::timestamptz,
      true,
      new.approver_id,
      array[new.employee_id]
    );

    -- In-app notification to requester (PRD US-LEAVE-02)
    insert into notifications (user_id, kind, payload)
    values (
      new.employee_id,
      'leave_approved',
      jsonb_build_object(
        'leave_id', new.id,
        'starts_at', new.starts_at,
        'ends_at', new.ends_at,
        'approved_by', new.approver_id
      )
    );
  end if;

  if tg_op = 'UPDATE'
     and new.status = 'denied'
     and old.status = 'pending' then
    insert into notifications (user_id, kind, payload)
    values (
      new.employee_id,
      'leave_denied',
      jsonb_build_object('leave_id', new.id, 'denied_by', new.approver_id)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists leave_approve_calendar on leave_requests;
create trigger leave_approve_calendar
  after update of status on leave_requests
  for each row execute function public.leave_approve_calendar();

-- ---------------------------------------------------------------------------
-- 9.2 Karyera Strukturu — career_levels
-- PRD §9.2: (id, name, level_index, requirements jsonb)
-- Admin edits; users read.
-- ---------------------------------------------------------------------------
create table if not exists career_levels (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  level_index int not null unique,
  requirements jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_career_level_index on career_levels(level_index asc);

alter table career_levels enable row level security;

create policy career_read_all on career_levels for select
  using (auth.role() = 'authenticated');

create policy career_admin_write on career_levels for all
  using (is_admin()) with check (is_admin());

-- Seed 4 levels (matching existing CareerPage stubs)
insert into career_levels (name, level_index, requirements)
values
  ('Junior', 1, '["Mentor altında işləmək","Layihə sənədlərini oxumaq","Hər həftə 1 tapşırıq tamamlamaq"]'::jsonb),
  ('Mid', 2, '["Müstəqil layihə paketləri","En az 3 tamamlanmış layihə","Müştəri görüşlərində iştirak"]'::jsonb),
  ('Senior', 3, '["Layihə rəhbərliyi","Ekspertiza sertifikatı","5+ bağlanmış layihə"]'::jsonb),
  ('Principal', 4, '["Strateji qərarlar","Müştəri münasibətlərinin idarəsi","Komanda mentorinqi"]'::jsonb)
on conflict (level_index) do nothing;

-- ---------------------------------------------------------------------------
-- 9.3 Məzmun Planlaması — content_plans
-- PRD §9.3: (id, channel, scheduled_at, topic, owner_id, status, body)
-- Admin only.
-- NOTE: PRD §9.3 does not enumerate channels; using common marketing channels.
-- Status from empty-state: idea → draft → review → published
-- ---------------------------------------------------------------------------
create table if not exists content_plans (
  id uuid primary key default uuid_generate_v4(),
  channel text not null check (channel in ('instagram', 'linkedin', 'telegram', 'website', 'email', 'other')),
  scheduled_at timestamptz not null,
  topic text not null,
  owner_id uuid references profiles(id),
  status text not null default 'idea' check (status in ('idea', 'draft', 'review', 'published')),
  body text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_content_plans_scheduled on content_plans(scheduled_at asc);

alter table content_plans enable row level security;

create policy content_admin_all on content_plans for all
  using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- §3.2 Role-scoped views (PRD §5 Module 3 / REQ-PROJ-01 RLS note)
-- ---------------------------------------------------------------------------

-- projects_admin_view: full row (financial fields included)
create or replace view projects_admin_view
  with (security_invoker = true)
as
  select * from projects;

-- projects_user_view: no payment_buffer_days (finance-planning field)
create or replace view projects_user_view
  with (security_invoker = true)
as
  select
    id, name, client_id, phases, requires_expertise,
    expertise_deadline, deadline, start_date,
    status, created_by, created_at, archived_at, reopened_at
  from projects;

-- outsource_user_view: PRD §7 / §3.2 — no amount/paid_at/payment_method
create or replace view outsource_user_view
  with (security_invoker = true)
as
  select
    id, project_id, work_title, contact_person,
    contact_company, responsible_user_id, deadline, status
  from outsource_items;

grant select on outsource_user_view to authenticated;
grant select on projects_user_view to authenticated;
grant select on projects_admin_view to authenticated;
