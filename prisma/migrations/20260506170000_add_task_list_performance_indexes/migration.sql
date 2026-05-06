-- Add indexes for high-concurrency task list reads.
-- These are created idempotently because production may already have partial indexes
-- from Supabase-side migrations or manual operations.

CREATE INDEX IF NOT EXISTS "creative_tasks_user_updated_idx"
  ON "creative_tasks" ("user_id", "updated_at" DESC);

CREATE INDEX IF NOT EXISTS "creative_tasks_user_status_updated_idx"
  ON "creative_tasks" ("user_id", "status", "updated_at" DESC);

CREATE INDEX IF NOT EXISTS "task_summaries_user_type_updated_idx"
  ON "task_summaries" ("user_id", "task_type", "updated_at" DESC);

CREATE INDEX IF NOT EXISTS "task_summaries_user_status_updated_idx"
  ON "task_summaries" ("user_id", "status", "updated_at" DESC);
