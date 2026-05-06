CREATE TABLE IF NOT EXISTS "public"."agent_cli_device_logins" (
  "id" TEXT NOT NULL,
  "device_code" TEXT NOT NULL,
  "user_code" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "user_id" UUID,
  "api_key_id" TEXT,
  "api_key_secret" TEXT,
  "label" TEXT,
  "client_json" JSONB,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "approved_at" TIMESTAMP(3),
  "denied_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_cli_device_logins_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "agent_cli_device_logins_device_code_key"
  ON "public"."agent_cli_device_logins"("device_code");

CREATE UNIQUE INDEX IF NOT EXISTS "agent_cli_device_logins_user_code_key"
  ON "public"."agent_cli_device_logins"("user_code");

CREATE INDEX IF NOT EXISTS "agent_cli_device_logins_user_code_idx"
  ON "public"."agent_cli_device_logins"("user_code");

CREATE INDEX IF NOT EXISTS "agent_cli_device_logins_device_code_idx"
  ON "public"."agent_cli_device_logins"("device_code");

CREATE INDEX IF NOT EXISTS "agent_cli_device_logins_user_id_idx"
  ON "public"."agent_cli_device_logins"("user_id");
