alter table public.invitations
  drop constraint if exists invitations_email_key;

create unique index if not exists invitations_email_pending_unique
  on public.invitations (email)
  where accepted_at is null;
