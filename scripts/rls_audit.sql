-- rls_audit.sql — PRD §9.1 CI check.
-- Fails (exits non-zero via psql -v ON_ERROR_STOP=1) if any non-system table
-- in the public schema has RLS disabled. Run before every deploy.
--
-- Usage: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/rls_audit.sql

DO $$
DECLARE
  v_table text;
  v_count int := 0;
  v_report text := '';
BEGIN
  -- Collect tables with RLS disabled (rowsecurity = false) in public schema.
  -- Exclude Supabase-internal tables that live in public but are managed by auth.
  FOR v_table IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = false
      AND c.relname NOT IN (
        -- Supabase storage/realtime tables that may live in public
        'schema_migrations',
        'buckets',
        'objects',
        'migrations'
      )
    ORDER BY c.relname
  LOOP
    v_count := v_count + 1;
    v_report := v_report || '  - ' || v_table || E'\n';
  END LOOP;

  IF v_count > 0 THEN
    RAISE EXCEPTION E'RLS audit FAILED — % table(s) have RLS disabled:\n%\nEnable RLS before deploy: ALTER TABLE <name> ENABLE ROW LEVEL SECURITY;', v_count, v_report;
  END IF;

  RAISE NOTICE 'RLS audit PASSED — all % public tables have RLS enabled.',
    (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r');
END $$;
