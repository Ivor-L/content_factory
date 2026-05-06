CREATE TABLE IF NOT EXISTS "public"."agent_capability_runs" (
  "id" TEXT NOT NULL,
  "capability_id" TEXT NOT NULL,
  "user_id" UUID,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "mode" TEXT NOT NULL DEFAULT 'submit',
  "input_json" JSONB,
  "result_json" JSONB,
  "error_json" JSONB,
  "artifacts_json" JSONB,
  "usage_json" JSONB,
  "business_type" TEXT,
  "business_id" TEXT,
  "business_task_id" TEXT,
  "business_status" TEXT,
  "idempotency_key" TEXT,
  "client_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMP(3),
  CONSTRAINT "agent_capability_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "agent_capability_runs_idempotency_key_key"
  ON "public"."agent_capability_runs"("idempotency_key");

CREATE INDEX IF NOT EXISTS "agent_capability_runs_user_id_idx"
  ON "public"."agent_capability_runs"("user_id");

CREATE INDEX IF NOT EXISTS "agent_capability_runs_capability_id_idx"
  ON "public"."agent_capability_runs"("capability_id");

CREATE INDEX IF NOT EXISTS "agent_capability_runs_business_type_business_id_idx"
  ON "public"."agent_capability_runs"("business_type", "business_id");
