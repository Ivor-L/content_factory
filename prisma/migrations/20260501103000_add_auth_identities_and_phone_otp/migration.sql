CREATE TABLE IF NOT EXISTS "public"."user_auth_identities" (
  "id" TEXT NOT NULL,
  "user_id" UUID NOT NULL,
  "provider" TEXT NOT NULL,
  "provider_uid" TEXT NOT NULL,
  "verified_at" TIMESTAMPTZ(6),
  "meta" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "user_auth_identities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."phone_otp_challenges" (
  "id" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "code_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "consumed_at" TIMESTAMPTZ(6),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "ip" TEXT,
  "user_agent" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "phone_otp_challenges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_auth_identities_provider_uid_key"
  ON "public"."user_auth_identities"("provider", "provider_uid");

CREATE INDEX IF NOT EXISTS "user_auth_identities_user_provider_idx"
  ON "public"."user_auth_identities"("user_id", "provider");

CREATE INDEX IF NOT EXISTS "phone_otp_challenges_phone_purpose_idx"
  ON "public"."phone_otp_challenges"("phone", "purpose", "created_at");

-- keep updated_at fresh
CREATE OR REPLACE FUNCTION public.set_user_auth_identities_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_auth_identities_updated_at ON "public"."user_auth_identities";
CREATE TRIGGER trg_user_auth_identities_updated_at
BEFORE UPDATE ON "public"."user_auth_identities"
FOR EACH ROW
EXECUTE FUNCTION public.set_user_auth_identities_updated_at();
