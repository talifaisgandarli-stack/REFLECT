-- PRD §3.2 / §6.4 / US-SYS-03 — close the schema gap: notification_preferences
-- canonical in PRD but missing from 0001.

create type notification_channel as enum ('in_app', 'email', 'telegram');

create table if not exists notification_preferences (
  user_id    uuid not null references profiles(id) on delete cascade,
  channel    notification_channel not null,
  event_kind text not null,
  enabled    boolean not null default true,
  primary key (user_id, channel, event_kind)
);

alter table notification_preferences enable row level security;
create policy np_self on notification_preferences for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy np_admin on notification_preferences for all
  using (is_admin()) with check (is_admin());
