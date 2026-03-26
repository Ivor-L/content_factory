-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "auth";
CREATE SCHEMA IF NOT EXISTS "public";

-- Ensure auth.users exists for Supabase-linked FKs
CREATE TABLE IF NOT EXISTS "auth"."users" (
    "id" UUID PRIMARY KEY
);

-- CreateTable
CREATE TABLE "characters" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar" TEXT NOT NULL,
    "voice_id" TEXT,
    "user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "characters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "selling_points" TEXT NOT NULL,
    "selling_points_text" TEXT,
    "images" TEXT NOT NULL,
    "analysis_result" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "replications" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'FULL',
    "product_id" TEXT,
    "script_id" TEXT,
    "input_params" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "replications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scripts" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "video_url" TEXT NOT NULL,
    "breakdown" TEXT NOT NULL,
    "blueprint" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "history_docs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "channel" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "source_type" TEXT,
    "original_path" TEXT NOT NULL,
    "insights_path" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB,
    "voice_profile_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "history_docs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "channel" TEXT,
    "name" TEXT,
    "description" TEXT,
    "profile" JSONB NOT NULL,
    "preview_url" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voice_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_assets" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "channel" TEXT,
    "tags" TEXT[],
    "content_path" TEXT,
    "structure" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "story_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "style_presets" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "preview_url" TEXT,
    "spec" JSONB NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "style_presets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creative_tasks" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "title" TEXT,
    "channel" TEXT,
    "target_output" TEXT,
    "idea_text" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'diagnosis',
    "status" TEXT NOT NULL DEFAULT 'active',
    "goal" JSONB,
    "metadata" JSONB,
    "outline_path" TEXT,
    "draft_path" TEXT,
    "artifacts" JSONB,
    "voice_profile_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creative_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creative_task_history_docs" (
    "task_id" UUID NOT NULL,
    "history_doc_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creative_task_history_docs_pkey" PRIMARY KEY ("task_id","history_doc_id")
);

-- CreateTable
CREATE TABLE "creative_task_stories" (
    "task_id" UUID NOT NULL,
    "story_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creative_task_stories_pkey" PRIMARY KEY ("task_id","story_id")
);

-- CreateTable
CREATE TABLE "creative_task_styles" (
    "task_id" UUID NOT NULL,
    "style_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creative_task_styles_pkey" PRIMARY KEY ("task_id","style_id")
);

-- CreateTable
CREATE TABLE "creative_events" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creative_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storyboard_segments" (
    "id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "duration" DOUBLE PRECISION NOT NULL DEFAULT 8.0,
    "time_range" TEXT,
    "image_prompt" TEXT,
    "video_prompt" TEXT,
    "generated_image" TEXT,
    "generated_video" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "task_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "storyboard_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storyboard_tasks" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ANALYZING',
    "video_url" TEXT,
    "cover_image" TEXT,
    "product_id" TEXT,
    "character_id" TEXT,
    "scene_image" TEXT,
    "scene_prompt" TEXT,
    "script_content" TEXT,
    "reference_image" TEXT,
    "storyboard_image_url" TEXT,
    "storyboard_structure" JSONB,
    "storyboard_images" JSONB,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "video_type" TEXT,
    "task_id" TEXT,
    "user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "storyboard_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xhs_poster_jobs" (
    "id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT,
    "copy_text" TEXT NOT NULL,
    "variation_count" INTEGER NOT NULL DEFAULT 3,
    "style_id" TEXT NOT NULL,
    "style_name" TEXT,
    "style_snapshot" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "source_task_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "xhs_poster_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xhs_poster_images" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "prompt" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xhs_poster_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "digital_human_videos" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "audio_url" TEXT NOT NULL,
    "script_content" TEXT,
    "result_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'GENERATING',
    "user_id" UUID,
    "duration_seconds" DOUBLE PRECISION,
    "workflow_id" TEXT,
    "source_task_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "digital_human_videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_video_tasks" (
    "id" TEXT NOT NULL,
    "user_id" UUID,
    "title" TEXT,
    "video_type" TEXT NOT NULL,
    "script_content" TEXT,
    "audio_url" TEXT,
    "audio_duration" DOUBLE PRECISION,
    "theme_key" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "video_url" TEXT,
    "video_storage_path" TEXT,
    "cover_url" TEXT,
    "cover_storage_path" TEXT,
    "duration_seconds" DOUBLE PRECISION,
    "timeline" JSONB,
    "metadata" JSONB,
    "render_stats" JSONB,
    "remotion_composition" TEXT,
    "remotion_props" JSONB,
    "source_task_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_video_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "replication_shot_tasks" (
    "id" TEXT NOT NULL,
    "user_id" UUID,
    "script_id" TEXT NOT NULL,
    "product_id" TEXT,
    "character_id" TEXT,
    "scene_image_url" TEXT,
    "product_scene_image_url" TEXT,
    "shot_prompts" JSONB,
    "first_frames" JSONB,
    "end_frame_options" JSONB,
    "videos" JSONB,
    "final_video_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "replication_shot_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6),
    "username" TEXT,
    "full_name" TEXT,
    "avatar_url" TEXT,
    "website" TEXT,
    "api_key" TEXT,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "storyboard_tasks_task_id_key" ON "storyboard_tasks"("task_id");

-- AddForeignKey
ALTER TABLE "replications" ADD CONSTRAINT "replications_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replications" ADD CONSTRAINT "replications_script_id_fkey" FOREIGN KEY ("script_id") REFERENCES "scripts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "history_docs" ADD CONSTRAINT "history_docs_voice_profile_id_fkey" FOREIGN KEY ("voice_profile_id") REFERENCES "voice_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creative_tasks" ADD CONSTRAINT "creative_tasks_voice_profile_id_fkey" FOREIGN KEY ("voice_profile_id") REFERENCES "voice_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creative_task_history_docs" ADD CONSTRAINT "creative_task_history_docs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "creative_tasks"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "creative_task_history_docs" ADD CONSTRAINT "creative_task_history_docs_history_doc_id_fkey" FOREIGN KEY ("history_doc_id") REFERENCES "history_docs"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "creative_task_stories" ADD CONSTRAINT "creative_task_stories_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "creative_tasks"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "creative_task_stories" ADD CONSTRAINT "creative_task_stories_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "story_assets"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "creative_task_styles" ADD CONSTRAINT "creative_task_styles_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "creative_tasks"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "creative_task_styles" ADD CONSTRAINT "creative_task_styles_style_id_fkey" FOREIGN KEY ("style_id") REFERENCES "style_presets"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "creative_events" ADD CONSTRAINT "creative_events_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "creative_tasks"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "storyboard_segments" ADD CONSTRAINT "storyboard_segments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "storyboard_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storyboard_tasks" ADD CONSTRAINT "storyboard_tasks_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storyboard_tasks" ADD CONSTRAINT "storyboard_tasks_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xhs_poster_jobs" ADD CONSTRAINT "xhs_poster_jobs_source_task_id_fkey" FOREIGN KEY ("source_task_id") REFERENCES "creative_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xhs_poster_images" ADD CONSTRAINT "xhs_poster_images_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "xhs_poster_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digital_human_videos" ADD CONSTRAINT "digital_human_videos_source_task_id_fkey" FOREIGN KEY ("source_task_id") REFERENCES "creative_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_video_tasks" ADD CONSTRAINT "knowledge_video_tasks_source_task_id_fkey" FOREIGN KEY ("source_task_id") REFERENCES "creative_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replication_shot_tasks" ADD CONSTRAINT "replication_shot_tasks_script_id_fkey" FOREIGN KEY ("script_id") REFERENCES "scripts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replication_shot_tasks" ADD CONSTRAINT "replication_shot_tasks_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replication_shot_tasks" ADD CONSTRAINT "replication_shot_tasks_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add FK to Supabase auth.users for profiles
ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Ensure Supabase roles can access the public schema objects
GRANT USAGE ON SCHEMA "public" TO postgres, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA "public" TO postgres, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA "public" TO postgres, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA "public" TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA "public" GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA "public" GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
