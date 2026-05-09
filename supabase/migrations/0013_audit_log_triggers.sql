-- PRD §3.2 / §9.4: audit_log writes for privileged actions.
-- Triggers capture role_id changes on profiles and any system_settings write.
-- These run server-side so they can't be bypassed by client code.

-- ── Helper: write to audit_log ───────────────────────────────────────────────

create or replace function audit_privileged_action()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid;
  action_label text;
  resource_label text;
begin
  -- Attempt to identify the actor from the current Supabase JWT claim.
  begin
    actor := (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid;
  exception when others then
    actor := null;
  end;

  if TG_TABLE_NAME = 'profiles' then
    -- Only audit role_id changes (column 9 in definition order is irrelevant;
    -- we check old vs new values explicitly).
    if OLD.role_id IS DISTINCT FROM NEW.role_id then
      action_label := 'role_changed';
      resource_label := 'profile:' || NEW.id::text ||
                        ' from:' || coalesce(OLD.role_id::text, 'null') ||
                        ' to:' || coalesce(NEW.role_id::text, 'null');
      insert into audit_log (actor_id, action, resource)
      values (coalesce(actor, NEW.id), action_label, resource_label);
    end if;

  elsif TG_TABLE_NAME = 'system_settings' then
    if TG_OP = 'INSERT' then
      action_label := 'settings_created';
    else
      action_label := 'settings_updated';
    end if;
    resource_label := 'system_settings:' || NEW.key;
    insert into audit_log (actor_id, action, resource)
    values (actor, action_label, resource_label);
  end if;

  return NEW;
end;
$$;

-- ── Trigger on profiles (role_id change) ─────────────────────────────────────

drop trigger if exists trg_audit_profile_role on profiles;
create trigger trg_audit_profile_role
  after update on profiles
  for each row
  execute function audit_privileged_action();

-- ── Trigger on system_settings (any write) ───────────────────────────────────

drop trigger if exists trg_audit_system_settings on system_settings;
create trigger trg_audit_system_settings
  after insert or update on system_settings
  for each row
  execute function audit_privileged_action();
