-- PRD §11 — Dedicated table for Telegram linking codes.
--
-- Previously codes were stored under system_settings keys 'telegram_link:<code>'.
-- system_settings has SELECT policy `auth.role() = 'authenticated'`, so any
-- signed-in user could enumerate every active code and hijack another user's
-- chat_id by issuing /start <stolen_code> from their own Telegram account.
--
-- Strict RLS: a user can only read/write their own row. Service role (used by
-- the webhook handler) bypasses RLS so the bot can still resolve codes.

create table if not exists telegram_link_codes (
  code text primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists telegram_link_codes_user_idx on telegram_link_codes(user_id);
create index if not exists telegram_link_codes_expires_idx on telegram_link_codes(expires_at);

alter table telegram_link_codes enable row level security;

-- A user may see and write only their own pending code.
create policy tlc_self_select on telegram_link_codes
  for select using (user_id = auth.uid());

create policy tlc_self_write on telegram_link_codes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Sweep stale codes from system_settings if the legacy keys exist.
delete from system_settings where key like 'telegram_link:%';
