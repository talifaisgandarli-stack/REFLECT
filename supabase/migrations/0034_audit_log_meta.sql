-- Add meta jsonb column to audit_log (PRD §9.4 — privileged action context).
-- Safe to run multiple times (idempotent via DO block).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'audit_log'
      AND column_name  = 'meta'
  ) THEN
    ALTER TABLE audit_log ADD COLUMN meta jsonb;
  END IF;
END $$;
