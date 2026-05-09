-- Storage size + MIME guard for project-documents (PRD §10.2 / §M3 REQ-PROJ-03).
--
-- The UI in src/components/ProjectDocuments.tsx already pre-flights file size
-- (25 MB) and a content-type allow-list. This migration mirrors both at the
-- DB layer so a tampered client (or a direct PostgREST insert via the service
-- role) can't smuggle a 200 MB binary or an executable past the bucket.
--
-- storage.objects.metadata is the only place Supabase Storage records the
-- content-length and mimetype it observed during upload, so we consult it
-- via a BEFORE INSERT/UPDATE trigger on storage.objects (per-row, scoped to
-- bucket_id = 'project-documents'). The allow-list is the same regex the
-- UI uses, encoded as a Postgres array.

create or replace function public.pd_storage_size_guard()
returns trigger language plpgsql security definer set search_path = public, storage as $$
declare
  v_size bigint;
  v_mime text;
  v_max_bytes constant bigint := 25 * 1024 * 1024;
begin
  if new.bucket_id is distinct from 'project-documents' then
    return new;
  end if;

  -- storage.objects.metadata is a jsonb populated by Supabase Storage with
  -- {"size": <bytes>, "mimetype": "..."}. NULL or missing → reject.
  v_size := nullif(new.metadata ->> 'size', '')::bigint;
  v_mime := lower(coalesce(new.metadata ->> 'mimetype', ''));

  if v_size is null then
    raise exception 'pd_storage_size_unknown' using errcode = '22023';
  end if;
  if v_size > v_max_bytes then
    raise exception 'pd_storage_size_exceeded'
      using errcode = '22023',
            detail = format('size=%s max=%s', v_size, v_max_bytes);
  end if;
  if v_mime <> '' and not (
    v_mime like 'application/pdf'
    or v_mime like 'application/msword'
    or v_mime like 'application/vnd.openxmlformats-officedocument.%'
    or v_mime like 'application/vnd.ms-excel'
    or v_mime like 'application/zip'
    or v_mime like 'application/json'
    or v_mime like 'application/rtf'
    or v_mime like 'image/png'
    or v_mime like 'image/jpeg'
    or v_mime like 'image/jpg'
    or v_mime like 'image/webp'
    or v_mime like 'image/gif'
    or v_mime like 'image/svg+xml'
    or v_mime like 'text/plain'
    or v_mime like 'text/csv'
  ) then
    raise exception 'pd_storage_mime_blocked'
      using errcode = '22023',
            detail = format('mimetype=%s', v_mime);
  end if;

  return new;
end;
$$;

drop trigger if exists pd_storage_size_guard_t on storage.objects;
create trigger pd_storage_size_guard_t
  before insert or update of metadata on storage.objects
  for each row execute function public.pd_storage_size_guard();
