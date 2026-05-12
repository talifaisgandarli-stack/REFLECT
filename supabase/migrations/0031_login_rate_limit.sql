-- REQ-AUTH-01 — basic IP-based login rate limit.
-- Stored in DB rather than memory so it survives across edge-function instances.
-- 5 attempts per 15-minute window per IP.

create table if not exists login_attempts (
  id uuid primary key default uuid_generate_v4(),
  ip text not null,
  email text,
  attempted_at timestamptz not null default now()
);

create index if not exists login_attempts_ip_time_idx
  on login_attempts(ip, attempted_at desc);

-- Service role only writes/reads this table; no client-side access needed.
alter table login_attempts enable row level security;

create or replace function public.check_login_rate(p_ip text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count int;
begin
  -- Garbage-collect rows older than 1 hour as a side effect.
  delete from login_attempts where attempted_at < now() - interval '1 hour';

  select count(*) into recent_count
    from login_attempts
   where ip = p_ip
     and attempted_at > now() - interval '15 minutes';

  return recent_count < 5;
end;
$$;

create or replace function public.record_login_attempt(p_ip text, p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into login_attempts (ip, email) values (p_ip, p_email);
end;
$$;

revoke all on function public.check_login_rate(text) from public;
revoke all on function public.record_login_attempt(text, text) from public;
grant execute on function public.check_login_rate(text) to service_role;
grant execute on function public.record_login_attempt(text, text) to service_role;
