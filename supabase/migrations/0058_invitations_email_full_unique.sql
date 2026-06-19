-- Replace the partial unique index from 0057 with a full unique constraint.
--
-- The partial index `invitations_email_pending_unique` was created on
-- (email) WHERE accepted_at IS NULL, intending to allow accepted-invite
-- audit rows to coexist while still preventing duplicate pending invites.
-- That semantic was correct per PRD §270, but Postgres `ON CONFLICT (email)`
-- (with no WHERE clause) only infers non-partial unique indexes — partial
-- ones are skipped during inference. supabase-js's
-- `upsert(..., { onConflict: 'email' })` emits exactly that bare ON CONFLICT,
-- so the partial index was invisible to the upsert path and every invite
-- attempt continued to fail with:
--   "there is no unique or exclusion constraint matching the ON CONFLICT
--    specification"
--
-- Fix: full unique constraint on email. This means there can only ever be
-- one invitations row per address; once accepted, re-inviting the same
-- email upserts (resets accepted_at + new token) the existing row, which
-- is acceptable — the audit_log already records the accept event and the
-- profiles table records the resulting user; the invitations row is just
-- the magic-link plumbing.
--
-- Pre-flight: if any duplicate emails exist (they shouldn't — every
-- upsert before this point silently failed at the DB layer and never
-- inserted), keep only the most recent and drop the rest. Belt-and-braces
-- so the unique constraint creation can't blow up an otherwise-clean
-- migration.

drop index if exists public.invitations_email_pending_unique;

delete from public.invitations a
  using public.invitations b
  where a.email = b.email
    and a.id <> b.id
    and a.created_at < b.created_at;

alter table public.invitations
  add constraint invitations_email_key unique (email);
