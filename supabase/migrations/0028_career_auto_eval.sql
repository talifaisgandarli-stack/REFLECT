-- US-CAREER-01 final AC — "criteria already met show a green check".
-- PRD doesn't enumerate metric kinds. Schema decision (logged per
-- prd-guard rule 5): each requirements jsonb item may optionally carry
-- { kind, op, value } where kind ∈ ('closed_projects', 'completed_tasks').
-- Items without these fields stay manual (unchecked). PRD §3.2 may be
-- amended to formalise the metric vocabulary.
--
-- This migration is documentation-only — the requirements column is jsonb
-- so no schema change is needed; the editor and renderer agree on the shape.

-- (intentional no-op SQL; the file exists so the migration history stays
-- continuous and to anchor the down migration's revoke target if added later.)
select 1 where false;
