-- PRD §10.1 / REQ-SET-07 — firm-assets public bucket for logo + branding uploads.
-- Max 5 MB, images only. Admin write; public read (bucket is public=true).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'firm-assets',
  'firm-assets',
  true,
  5242880,  -- 5 MB
  ARRAY['image/jpeg','image/png','image/gif','image/webp','image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- Admin (level ≤ 2 or creator) can upload/replace/delete.
CREATE POLICY "firm-assets: admin write"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'firm-assets'
    AND EXISTS (
      SELECT 1
        FROM public.profiles p
        JOIN public.roles r ON r.id = p.role_id
       WHERE p.id = auth.uid()
         AND (p.is_creator = true OR r.level <= 2)
    )
  )
  WITH CHECK (
    bucket_id = 'firm-assets'
    AND EXISTS (
      SELECT 1
        FROM public.profiles p
        JOIN public.roles r ON r.id = p.role_id
       WHERE p.id = auth.uid()
         AND (p.is_creator = true OR r.level <= 2)
    )
  );
