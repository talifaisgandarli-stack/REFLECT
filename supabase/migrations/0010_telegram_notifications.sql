-- Telegram notifications infrastructure — PRD §8.1, §10.4, MODULE 12.
--
-- Three pieces:
--   1. notification_preferences (PRD §10.4) — per-user, per-channel,
--      per-event toggles. Default = enabled, so users opt out, not in.
--   2. telegram_alert_queue + DB triggers on incomes/expenses (US-TG-03)
--      — finance side effects fire from the DB so the UI mutation can't
--      lie or skip them, and a cron drains the queue. Decoupled from the
--      user's network.
--   3. system_settings seed for the income/expense alert thresholds
--      (US-TG-03 acceptance criterion: "thresholds in system_settings").
--
-- Out of scope for this migration:
--   - Daily deadline reminder logic (US-TG-02). Lives in
--     /api/cron/telegram-reminders, queries tasks directly. No new table.
--   - The actual Telegram send. Cron routes call the Bot API via fetch.

-- 1. notification_preferences
create type notification_channel as enum ('in_app', 'email', 'telegram');
create type notification_event as enum (
  'task_deadline',
  'mention',
  'task_status_change',
  'finance_alert',
  'mirai_feed'
);

create table if not exists notification_preferences (
  user_id uuid not null references profiles(id) on delete cascade,
  channel notification_channel not null,
  event_kind notification_event not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, channel, event_kind)
);
create index if not exists idx_notif_prefs_user on notification_preferences(user_id);

alter table notification_preferences enable row level security;
create policy notif_prefs_self on notification_preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Helper for the cron to read prefs as service-role.
create or replace function public.notif_pref_enabled(
  p_user uuid,
  p_channel notification_channel,
  p_event notification_event
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select enabled
        from notification_preferences
       where user_id = p_user
         and channel = p_channel
         and event_kind = p_event
       limit 1
    ),
    true -- default = on per PRD §10.4 (users opt out)
  );
$$;
revoke all on function public.notif_pref_enabled(uuid, notification_channel, notification_event) from public;

-- 2. Finance alert queue + triggers
create table if not exists telegram_alert_queue (
  id uuid primary key default uuid_generate_v4(),
  kind text not null check (kind in ('income', 'expense', 'overdue_receivable')),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists idx_tg_queue_pending on telegram_alert_queue(created_at)
  where sent_at is null;

alter table telegram_alert_queue enable row level security;
-- No SELECT/INSERT for end users — only service role drains this.
create policy tg_queue_admin_only on telegram_alert_queue for all
  using (is_admin()) with check (is_admin());

-- Threshold lookup (defaults applied if system_settings is empty).
create or replace function public.finance_threshold(p_key text)
returns numeric
language sql
stable
as $$
  select coalesce(
    (
      select (value::text)::numeric
        from system_settings
       where key = p_key
       limit 1
    ),
    case p_key
      when 'income_alert' then 5000
      when 'expense_alert' then 2000
      else 0
    end
  );
$$;

create or replace function public.queue_finance_alert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  threshold numeric;
  kind text;
begin
  if tg_table_name = 'incomes' then
    kind := 'income';
    threshold := public.finance_threshold('income_alert');
  elsif tg_table_name = 'expenses' then
    kind := 'expense';
    threshold := public.finance_threshold('expense_alert');
  else
    return new;
  end if;

  if new.amount >= threshold then
    insert into telegram_alert_queue (kind, payload) values (
      kind,
      jsonb_build_object(
        'id', new.id,
        'amount', new.amount,
        'project_id', new.project_id,
        'logged_by', case
          when tg_table_name = 'incomes' then null  -- incomes has no created_by today
          else null
        end,
        'occurred_at', new.occurred_at
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_incomes_alert on incomes;
create trigger trg_incomes_alert after insert on incomes
  for each row execute function public.queue_finance_alert();

drop trigger if exists trg_expenses_alert on expenses;
create trigger trg_expenses_alert after insert on expenses
  for each row execute function public.queue_finance_alert();

-- 3. Threshold seeds (PRD §8.1 / US-TG-03 acceptance criterion)
insert into system_settings (key, value) values
  ('income_alert',  '5000'::jsonb),
  ('expense_alert', '2000'::jsonb)
on conflict (key) do nothing;
