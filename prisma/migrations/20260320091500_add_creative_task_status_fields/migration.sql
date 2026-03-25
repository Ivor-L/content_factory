-- Add progress and result columns for creative_tasks
ALTER TABLE "public"."creative_tasks"
    ADD COLUMN IF NOT EXISTS "progress" integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "layout_result_json" jsonb,
    ADD COLUMN IF NOT EXISTS "generated_images_json" jsonb,
    ADD COLUMN IF NOT EXISTS "error_message" text;
