-- 0047 — PRD §6.x — task templates so admins can codify recurring task patterns
-- ("Ekspertizaya hazırlıq", "Müştəri görüşü hazırlığı", etc.).
-- Single-table design: each row is one template task; admins manage from
-- Settings → Şablonlar later. UI exposes a "Şablondan yarat" picker on Tasks.

create table if not exists task_templates (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  title text not null,
  description text,
  estimated_duration numeric(8, 2),
  duration_unit text default 'hours',
  risk_buffer_pct integer default 0,
  labels text[] default '{}',
  is_expertise_subtask boolean default false,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists task_templates_created_at_idx on task_templates (created_at desc);

alter table task_templates enable row level security;

-- Templates are firm-wide reference data; any authenticated user can read,
-- only admins manage.
create policy task_templates_select on task_templates
  for select using (auth.role() = 'authenticated');
create policy task_templates_admin_write on task_templates
  for all using (is_admin()) with check (is_admin());
