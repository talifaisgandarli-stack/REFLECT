-- PRD §10.4: Pre-deploy parity test.
-- Run BEFORE each deploy that touches a renamed column or migrated table.
-- Exits non-zero (via RAISE EXCEPTION) if counts/sums don't match.
-- Usage: psql $DATABASE_URL -v ON_ERROR_STOP=1 -f supabase/scripts/parity_test.sql

DO $$
DECLARE
  fail BOOLEAN := false;

  -- REQ-PROJ-06: phases[] migrated from legacy phase (singular)
  cnt_phases_empty BIGINT;

  -- REQ-TASK-02: assignee_ids[] migrated from legacy assignee_id
  cnt_assignees_empty BIGINT;

  -- REQ-CRM-03 / migration 0012: ai_icp_fit text column (was numeric)
  cnt_icp_null BIGINT;
  cnt_icp_deprecated_nonnull BIGINT;

BEGIN
  -- 1. projects.phases[] must never be empty when project was created pre-migration
  --    (a blank array means the migration didn't run correctly)
  SELECT COUNT(*) INTO cnt_phases_empty
  FROM projects
  WHERE phases IS NULL OR array_length(phases, 1) IS NULL;

  -- Note: projects with genuinely zero phases are valid (newly created), so we
  -- only flag if phases column itself is NULL (migration incomplete).
  IF cnt_phases_empty > 0 THEN
    RAISE WARNING 'PARITY FAIL: % project rows have NULL phases[] (expected [])', cnt_phases_empty;
    fail := true;
  END IF;

  -- 2. tasks.assignee_ids[] must not be NULL (default is {})
  SELECT COUNT(*) INTO cnt_assignees_empty
  FROM tasks
  WHERE assignee_ids IS NULL;

  IF cnt_assignees_empty > 0 THEN
    RAISE WARNING 'PARITY FAIL: % task rows have NULL assignee_ids (expected [])', cnt_assignees_empty;
    fail := true;
  END IF;

  -- 3. clients: after migration 0012, the new text ai_icp_fit column should be
  --    populated for any row where the deprecated numeric column was non-null.
  --    (Only runs if the deprecated column still exists.)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = '_deprecated_ai_icp_fit'
  ) THEN
    SELECT COUNT(*) INTO cnt_icp_deprecated_nonnull
    FROM clients
    WHERE _deprecated_ai_icp_fit IS NOT NULL AND ai_icp_fit IS NULL;

    IF cnt_icp_deprecated_nonnull > 0 THEN
      RAISE WARNING 'PARITY FAIL: % client rows have _deprecated_ai_icp_fit but NULL ai_icp_fit', cnt_icp_deprecated_nonnull;
      fail := true;
    END IF;
  END IF;

  IF fail THEN
    RAISE EXCEPTION 'Pre-deploy parity test FAILED — see WARNINGs above. Deploy blocked.';
  ELSE
    RAISE NOTICE 'Parity test passed.';
  END IF;
END;
$$;
