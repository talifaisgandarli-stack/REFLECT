-- PRD §270 (REQ-AUTH-02): "Re-invite same email (existing pending) → reuse
-- and bump expiry." The /api/invitations/create handler implements this with
-- upsert(..., { onConflict: 'email' }), but the original schema (0001) only
-- created a non-unique index on email. Postgres ON CONFLICT requires a
-- UNIQUE or EXCLUSION constraint matching the inferred index, so the upsert
-- failed for every invitation attempt with:
--   "there is no unique or exclusion constraint matching the ON CONFLICT
--    specification"
-- The error was swallowed (the backend awaited the upsert but never
-- destructured the { error } field), so every invite returned ok:true while
-- nothing was written to the database. Symptom: admin clicks "Dəvət et",
-- sees a success toast, then the pending list is still empty.
--
-- Fix: partial unique index keyed on email WHERE accepted_at IS NULL.
-- Partial because once an invitation is accepted, the row becomes audit
-- history and we want a NEW invitation row to be possible if the user is
-- ever re-invited later. Postgres infers this index from
-- "ON CONFLICT (email)" as long as the row's accepted_at=null satisfies
-- the predicate, which it always does in the create handler's payload.

create unique index if not exists invitations_email_pending_unique
  on public.invitations (email)
  where accepted_at is null;
