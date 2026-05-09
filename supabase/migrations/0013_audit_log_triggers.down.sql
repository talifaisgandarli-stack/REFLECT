-- Rollback: remove audit triggers and helper function.
drop trigger if exists trg_audit_profile_role on profiles;
drop trigger if exists trg_audit_system_settings on system_settings;
drop function if exists audit_privileged_action();
