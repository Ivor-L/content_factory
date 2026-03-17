-- Run this in Supabase SQL Editor to fix the "new row violates row-level security policy" error

-- 1. Allow uploads (INSERT) to 'temp_uploads' bucket for authenticated users
-- If you want to allow guests/anonymous users too, change TO authenticated -> TO public
CREATE POLICY "Allow authenticated uploads to temp_uploads"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'temp_uploads');

-- 2. Allow viewing/downloading (SELECT) from 'temp_uploads' bucket
CREATE POLICY "Allow public read from temp_uploads"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'temp_uploads');

-- 3. (Optional) Allow users to update/delete their own files if needed
-- For now, we rely on the daily cleanup script for deletion.
