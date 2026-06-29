-- REQ-CRM-06 / REQ-PROJ-03 — a document can be a work-in-progress draft or a
-- finalized deliverable. Additive: existing rows are all treated as 'final'
-- (the prior implicit behaviour), new rows default to 'final' too; authors opt
-- a document into 'draft' explicitly. Constrained to the two known states.
alter table public.project_documents
  add column if not exists status text not null default 'final';

alter table public.project_documents
  drop constraint if exists project_documents_status_check;
alter table public.project_documents
  add constraint project_documents_status_check
  check (status in ('draft', 'final'));
