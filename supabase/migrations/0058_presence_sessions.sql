-- Per-session presence (REQ-PRESENCE-05 — "multiple active sessions → single
-- online state, highest priority wins"). The single-row user_presence model
-- (§10.5.1) cannot reconcile concurrent devices, so each session now writes its
-- own row in presence_sessions; a trigger collapses them into the canonical
-- per-user user_presence row that the UI + realtime already consume unchanged.
--
-- Priority: online > away > offline. A session is "live" while its heartbeat is
-- within 90s (REQ-PRESENCE-02 offline threshold); stale sessions are ignored.

create table if not exists presence_sessions (
  user_id uuid not null references profiles(id) on delete cascade,
  session_id text not null,
  status presence_status not null default 'online',
  last_heartbeat_at timestamptz not null default now(),
  current_page text,
  session_type text not null default 'desktop',
  primary key (user_id, session_id)
);

create index if not exists presence_sessions_user_idx on presence_sessions (user_id);

-- RLS: per-device rows are private (the public surface is the aggregated
-- user_presence row). Writes flow through the heartbeat API (service role) which
-- bypasses RLS; the self policy covers any direct client write.
alter table presence_sessions enable row level security;
create policy ps_self on presence_sessions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ps_admin_select on presence_sessions for select using (is_admin());

-- Collapse a user's live sessions into their canonical user_presence row.
-- security definer: must read across users and write user_presence past RLS.
create or replace function refresh_user_presence(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  best record;
begin
  select status, last_heartbeat_at, current_page, session_type
    into best
    from presence_sessions
   where user_id = p_user_id
     and last_heartbeat_at > now() - interval '90 seconds'
   order by case status when 'online' then 2 when 'away' then 1 else 0 end desc,
            last_heartbeat_at desc
   limit 1;

  if not found then
    -- No live session → offline; keep the most recent heartbeat as "last seen".
    insert into user_presence (user_id, status, last_heartbeat_at, current_page, session_type)
    values (
      p_user_id,
      'offline',
      coalesce((select max(last_heartbeat_at) from presence_sessions where user_id = p_user_id), now()),
      null,
      'desktop'
    )
    on conflict (user_id) do update
      set status = 'offline',
          last_heartbeat_at = excluded.last_heartbeat_at,
          current_page = null;
  else
    insert into user_presence (user_id, status, last_heartbeat_at, current_page, session_type)
    values (p_user_id, best.status, best.last_heartbeat_at, best.current_page, best.session_type)
    on conflict (user_id) do update
      set status = excluded.status,
          last_heartbeat_at = excluded.last_heartbeat_at,
          current_page = excluded.current_page,
          session_type = excluded.session_type;
  end if;
end;
$$;

create or replace function on_presence_session_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform refresh_user_presence(coalesce(new.user_id, old.user_id));
  return null;
end;
$$;

drop trigger if exists trg_presence_session_change on presence_sessions;
create trigger trg_presence_session_change
after insert or update or delete on presence_sessions
for each row execute function on_presence_session_change();
