-- Add DB-level DEFAULT to task_summaries.updated_at so that direct
-- Supabase API inserts (e.g. from n8n) work without violating NOT NULL.
-- Prisma's @updatedAt handles this at the ORM layer, but n8n bypasses Prisma.
ALTER TABLE "task_summaries"
  ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
