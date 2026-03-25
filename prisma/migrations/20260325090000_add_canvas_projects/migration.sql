-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."canvas_projects" (
    "id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "thumbnail" TEXT,
    "canvas_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "canvas_projects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "canvas_projects_user_id_idx"
    ON "public"."canvas_projects" ("user_id");
