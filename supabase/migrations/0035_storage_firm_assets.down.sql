DROP POLICY IF EXISTS "firm-assets: admin write" ON storage.objects;
DELETE FROM storage.buckets WHERE id = 'firm-assets';
