alter table public.project_documents
  drop constraint if exists project_documents_status_check;
alter table public.project_documents
  drop column if exists status;
