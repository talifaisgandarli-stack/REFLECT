-- PRD §9.1: RLS audit — fails (raises exception) if any public table lacks RLS or has no policy.
-- Run via: psql $DATABASE_URL -f supabase/scripts/rls_audit.sql
-- CI exits non-zero when this script fails (psql exits 3 on script error).

DO $$
DECLARE
  r RECORD;
  fail BOOLEAN := false;
BEGIN
  -- 1. Check every user-facing table has RLS enabled.
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT LIKE '_archived_%'
      AND tablename NOT LIKE '_deprecated_%'
      AND tablename NOT IN ('schema_migrations')
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = r.tablename
        AND c.relrowsecurity = true
    ) THEN
      RAISE WARNING 'RLS DISABLED on table: %', r.tablename;
      fail := true;
    END IF;
  END LOOP;

  -- 2. Check every RLS-enabled table has at least one policy.
  FOR r IN
    SELECT c.relname AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relrowsecurity = true
      AND c.relname NOT LIKE '_archived_%'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = r.tablename
    ) THEN
      RAISE WARNING 'NO POLICY on RLS-enabled table: %', r.tablename;
      fail := true;
    END IF;
  END LOOP;

  IF fail THEN
    RAISE EXCEPTION 'RLS audit failed — see WARNINGs above. Fix before deploy.';
  ELSE
    RAISE NOTICE 'RLS audit passed.';
  END IF;
END;
$$;
