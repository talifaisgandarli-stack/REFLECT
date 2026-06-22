-- Down: 0058 per-session presence. Removes the session table + trigger +
-- helper functions. user_presence (canonical per-user row) is left intact.

drop trigger if exists trg_presence_session_change on presence_sessions;
drop function if exists on_presence_session_change();
drop function if exists refresh_user_presence(uuid);
drop table if exists presence_sessions;
