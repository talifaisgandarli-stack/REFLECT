-- PRD §3.2 / §9.3 / US-CONTENT-01 — close the schema gap: content_plans was
-- canonical in PRD but missing from 0001.

create type content_status as enum ('idea', 'draft', 'review', 'published');

create table if not exists content_plans (
  id            uuid primary key default uuid_generate_v4(),
  channel       text not null,
  scheduled_at  timestamptz,
  topic         text not null,
  owner_id      uuid references profiles(id) on delete set null,
  status        content_status not null default 'draft',
  body          text,
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now()
);
create index if not exists idx_content_status on content_plans(status, scheduled_at);

-- §9.3 is admin-managed; reads visible to all authenticated for transparency.
alter table content_plans enable row level security;
create policy cp_select on content_plans for select
  using (auth.role() = 'authenticated');
create policy cp_admin_write on content_plans for all
  using (is_admin()) with check (is_admin());
