-- SQL to clean up old files from storage
-- Run this in the Supabase Dashboard -> SQL Editor

-- 1. Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Create a function to delete old files
CREATE OR REPLACE FUNCTION delete_old_temp_uploads()
RETURNS void AS $$
DECLARE
  target_bucket_id text := 'temp_uploads';
  older_than interval := interval '24 hours';
BEGIN
  -- Delete from storage.objects table.
  -- Supabase Storage will automatically clean up the physical files asynchronously.
  DELETE FROM storage.objects
  WHERE bucket_id = target_bucket_id
  AND created_at < now() - older_than;
END;
$$ LANGUAGE plpgsql;

-- 3. Schedule the job to run daily at midnight (UTC)
-- The job name is 'daily-temp-uploads-cleanup'
SELECT cron.schedule(
    'daily-temp-uploads-cleanup', -- unique job name
    '0 0 * * *',                  -- cron schedule (midnight daily)
    'SELECT delete_old_temp_uploads()'
);

-- To check scheduled jobs:
-- SELECT * FROM cron.job;

-- To unschedule/remove the job:
-- SELECT cron.unschedule('daily-temp-uploads-cleanup');
