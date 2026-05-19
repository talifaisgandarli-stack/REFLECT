-- 0049 — PRD §UX — per-user project favorites for quick access.
-- Many-to-many: a user can favorite many projects; each project can be a
-- favorite of many users.

create table if not exists project_favorites (
  user_id uuid not null references profiles(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, project_id)
);

create index if not exists project_favorites_user_idx on project_favorites (user_id);

alter table project_favorites enable row level security;

create policy project_favorites_self on project_favorites
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
