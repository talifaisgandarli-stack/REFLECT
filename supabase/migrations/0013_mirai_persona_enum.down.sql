-- Postgres has no DROP VALUE for enums. Down migration documents the intent;
-- a true rollback requires recreating the type and migrating dependent rows.
-- See: https://www.postgresql.org/docs/current/sql-altertype.html

-- no-op (enum value removal is non-trivial in postgres)
select 1;
