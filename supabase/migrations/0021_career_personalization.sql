-- US-CAREER-01 — personalized "current → next" promotion path.
-- profiles gets:
--   career_level_id        — admin-assigned current level (null = not placed)
--   career_progress jsonb  — { criteria: ["criterion text", ...] } user has ticked
--                            for the *next* level (self-assessed; admin promotes)

alter table profiles
  add column if not exists career_level_id uuid references career_levels(id) on delete set null,
  add column if not exists career_progress jsonb not null default '{}'::jsonb;

-- Anyone can read their own; admins can read all (existing profile RLS).
-- Users update their own progress only via auth.uid() = id (default RLS).
