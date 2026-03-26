-- Add missing storyboard columns so Prisma schema matches the database
ALTER TABLE "storyboard_tasks"
  ADD COLUMN IF NOT EXISTS "replication_mode" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS "image_model" TEXT,
  ADD COLUMN IF NOT EXISTS "video_model" TEXT,
  ADD COLUMN IF NOT EXISTS "source_replication_id" TEXT,
  ADD COLUMN IF NOT EXISTS "detailed_breakdown" JSONB,
  ADD COLUMN IF NOT EXISTS "final_video_url" TEXT,
  ADD COLUMN IF NOT EXISTS "enable_subtitles" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "subtitle_template" TEXT;

ALTER TABLE "storyboard_segments"
  ADD COLUMN IF NOT EXISTS "original_script" TEXT,
  ADD COLUMN IF NOT EXISTS "rewritten_script" TEXT,
  ADD COLUMN IF NOT EXISTS "visual_description" TEXT,
  ADD COLUMN IF NOT EXISTS "camera_notes" TEXT,
  ADD COLUMN IF NOT EXISTS "lighting_notes" TEXT,
  ADD COLUMN IF NOT EXISTS "image_generation_model" TEXT,
  ADD COLUMN IF NOT EXISTS "video_generation_model" TEXT,
  ADD COLUMN IF NOT EXISTS "generation_params" JSONB,
  ADD COLUMN IF NOT EXISTS "retry_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "subtitle_style" JSONB;
