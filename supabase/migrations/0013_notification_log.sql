-- Notification delivery log — dedupe guard for all outbound channels.
--
-- Records each (notification_id, channel) pair once it has been dispatched.
-- Crons check this table before sending to avoid re-sending on reruns or
-- overlapping schedules. Channel values: 'telegram', 'email', 'in-app'.
--
-- For task-deadline and content-plan reminders that are NOT tied to a
-- notifications row, we use a synthetic notification_id derived as
-- gen_random_uuid() seeded by (kind || ':' || entity_id || ':' || date || ':' || user_id)
-- — callers supply a deterministic UUID via the `notif_log_key(text)` helper
-- below so the PK dedup catches reruns.

create table if not exists public.notification_log (
  notification_id uuid        not null,
  channel         text        not null,
  sent_at         timestamptz not null default now(),
  constraint pk_notification_log primary key (notification_id, channel),
  constraint notification_log_channel_check check (channel in ('telegram', 'email', 'in-app'))
);

-- RLS: admins / service-role only. Regular users never read this table.
alter table public.notification_log enable row level security;
create policy "service role full access" on public.notification_log
  using (auth.role() = 'service_role');

-- Helper: deterministic UUID v5-like from a text key using md5.
-- Lets cron routes call notif_log_key('task:' || task_id || ':' || user_id || ':' || date)
-- and get a stable UUID for dedup without needing a notifications row.
create or replace function public.notif_log_key(p_key text)
returns uuid
language sql
immutable
security definer
set search_path = public
as $$
  select (
    substr(md5(p_key),  1,  8) || '-' ||
    substr(md5(p_key),  9,  4) || '-' ||
    substr(md5(p_key), 13,  4) || '-' ||
    substr(md5(p_key), 17,  4) || '-' ||
    substr(md5(p_key), 21, 12)
  )::uuid
$$;
