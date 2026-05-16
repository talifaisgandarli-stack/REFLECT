-- 0042 — REQ-AUTH-03 — user-initiated email change requests requiring
-- admin approval (PRD §5 Module 1: "Email/role: admin only").
--
-- Self-service email change is a security risk (account takeover, audit
-- discontinuity), so we route it through admin approval. The user files
-- a request; admin approves/rejects from Settings → Dəvətlər area later.

create table if not exists email_change_requests (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  current_email text not null,
  new_email text not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);

create index if not exists email_change_requests_status_idx
  on email_change_requests (status, created_at desc);

create index if not exists email_change_requests_user_idx
  on email_change_requests (user_id, created_at desc);

alter table email_change_requests enable row level security;

-- User can read + insert their own requests; admin can read + update all.
create policy ecr_self_read on email_change_requests
  for select using (auth.uid() = user_id or is_admin());

create policy ecr_self_insert on email_change_requests
  for insert with check (auth.uid() = user_id);

create policy ecr_admin_review on email_change_requests
  for update using (is_admin()) with check (is_admin());
