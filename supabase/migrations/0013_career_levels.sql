-- Career structure (PRD §M9.2). Admin-edited level catalogue; users read +
-- see promotion path from their current level → next.
-- profiles.career_level_id added so each user is bound to a level.

create table if not exists career_levels (
  id uuid primary key default uuid_generate_v4(),
  level_index int not null unique check (level_index >= 1),
  name text not null,
  description text,
  requirements jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_career_levels_index on career_levels(level_index);

alter table career_levels enable row level security;
create policy career_levels_read on career_levels for select using (auth.role() = 'authenticated');
create policy career_levels_admin_write on career_levels for all
  using (is_admin()) with check (is_admin());

alter table profiles
  add column if not exists career_level_id uuid references career_levels(id);

-- Seed canonical 4-tier ladder; idempotent on level_index conflict.
insert into career_levels (level_index, name, description, requirements)
values
  (1, 'Junior', 'Yeni qoşulanlar, mentor altında', '[
     "0-2 il təcrübə",
     "3+ tapşırığı vaxtında çatdırmaq",
     "Mentor sessiyalarında iştirak"
   ]'::jsonb),
  (2, 'Mid', 'Müstəqil layihə paketləri', '[
     "2-4 il təcrübə",
     "Müstəqil paket sahibliyi",
     "Mentee dəstəyi"
   ]'::jsonb),
  (3, 'Senior', 'Layihə rəhbərliyi, ekspertiza', '[
     "4-7 il təcrübə",
     "Layihə rəhbərliyi (≥2)",
     "Ekspertiza prosesində aparıcı rol"
   ]'::jsonb),
  (4, 'Principal', 'Strateji qərarlar, müştəri əlaqələri', '[
     "7+ il təcrübə",
     "Strateji qərarlar",
     "Müştəri sövdələşməsi və BD"
   ]'::jsonb)
on conflict (level_index) do nothing;
