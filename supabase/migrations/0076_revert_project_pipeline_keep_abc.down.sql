-- Down for 0076 — re-add the project-pipeline columns/types (cannot restore the
-- deleted auto-created project rows). Mirrors the relevant parts of 0075.
do $$ begin
  create type project_stage as enum
    ('lead', 'teklif', 'muzakire', 'icrada', 'portfolio', 'udulan');
exception when duplicate_object then null; end $$;
do $$ begin
  create type service_type as enum
    ('tikinti', 'dizayn', 'konsultasiya', 'renovasiya');
exception when duplicate_object then null; end $$;

alter table projects add column if not exists stage          project_stage not null default 'lead';
alter table projects add column if not exists service_type   service_type;
alter table projects add column if not exists value          numeric(14,2) not null default 0;
alter table projects add column if not exists progress       smallint not null default 0 check (progress between 0 and 100);
alter table projects add column if not exists owner_id        uuid references profiles(id);
alter table projects add column if not exists region         text;
alter table projects add column if not exists expected_close_at timestamptz;
alter table projects add column if not exists updated_at     timestamptz not null default now();
create index if not exists idx_projects_stage on projects(stage);
