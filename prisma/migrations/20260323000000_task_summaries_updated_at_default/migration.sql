-- Ensure table exists when running migrations on a fresh database.
CREATE TABLE IF NOT EXISTS "task_summaries" (
    "id" TEXT PRIMARY KEY,
    "user_id" UUID NOT NULL,
    "task_type" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "title" TEXT,
    "status" TEXT NOT NULL,
    "preview" TEXT,
    "thumbnail_url" TEXT,
    "progress" INTEGER,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add DB-level DEFAULT to task_summaries.updated_at so that direct
-- Supabase API inserts (e.g. from n8n) work without violating NOT NULL.
-- Prisma's @updatedAt handles this at the ORM layer, but n8n bypasses Prisma.
ALTER TABLE "task_summaries"
  ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
