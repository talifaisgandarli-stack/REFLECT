-- REQ-PROJ-03 — provision the project-documents storage bucket + policies.
-- The document upload UI (AddDocumentButton) uploads to a `project-documents`
-- bucket, but no migration ever created it and there were no storage.objects
-- policies — so the upload path was unprovisioned, and any hand-made bucket left
-- object access unscoped. This migration creates the bucket and mirrors the
-- project_documents table RLS onto the underlying objects.
--
-- Path convention (set by AddDocumentButton): `<project_id>/<timestamp>.<ext>`,
-- so (storage.foldername(name))[1] is the owning project id.

insert into storage.buckets (id, name, public, file_size_limit)
values ('project-documents', 'project-documents', false, 26214400)  -- 25 MB, matches the client fileSizeError(file, 25)
on conflict (id) do nothing;

-- READ: anyone who may see the project_documents row may fetch its file —
-- admins, project members, or a user the doc is explicitly shared with
-- (mirrors pd_select + the 0037 shared_with clause). Private bucket, so the
-- client fetches via createSignedUrl, which this policy authorizes.
drop policy if exists "project-documents read" on storage.objects;
create policy "project-documents read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'project-documents'
    and (
      public.is_admin()
      or public.is_project_member((storage.foldername(name))[1]::uuid)
      or exists (
        select 1 from public.project_documents d
        where d.storage_path = storage.objects.name
          and d.shared_with is not null
          -- shared_with is text[] (0001), so compare the uid as text.
          and auth.uid()::text = any (d.shared_with)
      )
    )
  );

-- WRITE: admin only, matching project_documents.pd_admin_write — keeps storage
-- and the table in lock-step so a denied DB insert can't leave an orphan object
-- (and vice-versa). Split per command so READ above stays the sole select rule.
drop policy if exists "project-documents insert" on storage.objects;
create policy "project-documents insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'project-documents' and public.is_admin());

drop policy if exists "project-documents update" on storage.objects;
create policy "project-documents update" on storage.objects
  for update to authenticated
  using (bucket_id = 'project-documents' and public.is_admin())
  with check (bucket_id = 'project-documents' and public.is_admin());

drop policy if exists "project-documents delete" on storage.objects;
create policy "project-documents delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'project-documents' and public.is_admin());
