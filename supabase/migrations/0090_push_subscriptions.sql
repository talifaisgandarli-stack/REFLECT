-- Web Push subscriptions (Phase 2 notifications). Each row is one browser/device
-- push endpoint a user has granted. The /api/push/notify function (Node runtime,
-- service role) reads these to deliver OS-level notifications when the app is
-- closed. RLS: a user manages only their own subscriptions.

create table if not exists push_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,            -- client public key (from subscription.keys.p256dh)
  auth text not null,              -- client auth secret (from subscription.keys.auth)
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;
create policy push_self on push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create index if not exists push_sub_user_idx on push_subscriptions (user_id);
