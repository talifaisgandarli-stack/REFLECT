-- PRD §3.2 / §9.2 — close the schema gap: career_levels table + profile link.
--
-- PRD §3.2 lists `career_levels (id, name, level_index, requirements jsonb)`
-- but does not specify how a user's current level is tracked. Decision logged
-- with this commit (per prd-guard rule 5): add `profiles.career_level_id`
-- nullable FK → career_levels. Follow-up PRD edit should add this column to
-- the profiles row in §3.2.

create table if not exists career_levels (
  id           uuid primary key default uuid_generate_v4(),
  name         text not null unique,
  level_index  int  not null unique,
  requirements jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now()
);

alter table profiles
  add column if not exists career_level_id uuid references career_levels(id) on delete set null;

-- Read by any authenticated user (US-CAREER-01); admin-only writes.
alter table career_levels enable row level security;
create policy career_select on career_levels for select using (auth.role() = 'authenticated');
create policy career_admin_write on career_levels for all using (is_admin()) with check (is_admin());

-- Seed: 4 levels matching the UI placeholder. Requirements as a jsonb array
-- of {label} entries; auto-evaluation against tasks/projects is future work.
insert into career_levels (name, level_index, requirements) values
  ('Junior', 1, '[
    {"label": "1+ tamamlanmış layihə"},
    {"label": "Mentor altında işləyir"},
    {"label": "Əsas alətləri mənimsəyib"}
  ]'::jsonb),
  ('Mid', 2, '[
    {"label": "≥3 tamamlanmış layihə"},
    {"label": "Müstəqil layihə paketləri idarə edir"},
    {"label": "Junior-a baxış verə bilir"}
  ]'::jsonb),
  ('Senior', 3, '[
    {"label": "≥6 tamamlanmış layihə"},
    {"label": "Layihə rəhbərliyi təcrübəsi"},
    {"label": "Ekspertiza prosesi tam idarə edir"}
  ]'::jsonb),
  ('Principal', 4, '[
    {"label": "Strateji qərarlarda iştirak"},
    {"label": "Müştəri əlaqələrini aparır"},
    {"label": "Komandada texniki standart qoyur"}
  ]'::jsonb)
on conflict (name) do nothing;
