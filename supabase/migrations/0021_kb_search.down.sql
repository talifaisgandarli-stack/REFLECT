drop function if exists public.match_knowledge_base(vector, int);
-- Note: PostgreSQL does not support removing values from an enum.
-- The 'legal' value added by 0021 is intentionally left in place on rollback.
