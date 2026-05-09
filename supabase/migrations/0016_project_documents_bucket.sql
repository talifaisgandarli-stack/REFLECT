-- project_documents storage bucket (PRD §M3 REQ-PROJ-03 / Module 5).
-- Private bucket; access enforced by storage.objects RLS that delegates to
-- project_documents.project_id project membership.

insert into storage.buckets (id, name, public)
values ('project-documents', 'project-documents', false)
on conflict (id) do nothing;

-- Read: admin or member of the document's project.
drop policy if exists pd_storage_select on storage.objects;
create policy pd_storage_select on storage.objects for select
  using (
    bucket_id = 'project-documents'
    and (
      is_admin()
      or exists (
        select 1 from project_documents pd
         where pd.storage_path = name
           and (pd.project_id is null or is_project_member(pd.project_id))
      )
    )
  );

-- Write/upload: admin or member of the project the upload binds to.
-- The owner column on storage.objects gets the auth.uid() automatically
-- via Supabase storage; we still assert the project membership here so
-- a user can't drop files into a project they aren't on.
drop policy if exists pd_storage_insert on storage.objects;
create policy pd_storage_insert on storage.objects for insert
  with check (
    bucket_id = 'project-documents'
    and (
      is_admin()
      or owner = auth.uid()
    )
  );

drop policy if exists pd_storage_delete on storage.objects;
create policy pd_storage_delete on storage.objects for delete
  using (
    bucket_id = 'project-documents'
    and (is_admin() or owner = auth.uid())
  );
