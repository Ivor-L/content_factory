-- CreateTable
CREATE TABLE "public"."canvas_grid_split_results" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "image_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canvas_grid_split_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "canvas_grid_split_results_task_id_key" ON "public"."canvas_grid_split_results"("task_id");
