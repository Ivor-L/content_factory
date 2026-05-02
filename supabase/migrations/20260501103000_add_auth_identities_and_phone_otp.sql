CREATE TABLE IF NOT EXISTS public.user_auth_identities (
  id text PRIMARY KEY,
  user_id uuid NOT NULL,
  provider text NOT NULL,
  provider_uid text NOT NULL,
  verified_at timestamptz(6),
  meta jsonb,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.phone_otp_challenges (
  id text PRIMARY KEY,
  phone text NOT NULL,
  purpose text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz(6) NOT NULL,
  consumed_at timestamptz(6),
  attempts integer NOT NULL DEFAULT 0,
  ip text,
  user_agent text,
  created_at timestamptz(6) NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_auth_identities_provider_uid_key
  ON public.user_auth_identities(provider, provider_uid);

CREATE INDEX IF NOT EXISTS user_auth_identities_user_provider_idx
  ON public.user_auth_identities(user_id, provider);

CREATE INDEX IF NOT EXISTS phone_otp_challenges_phone_purpose_idx
  ON public.phone_otp_challenges(phone, purpose, created_at);

CREATE OR REPLACE FUNCTION public.set_user_auth_identities_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_auth_identities_updated_at ON public.user_auth_identities;
CREATE TRIGGER trg_user_auth_identities_updated_at
BEFORE UPDATE ON public.user_auth_identities
FOR EACH ROW
EXECUTE FUNCTION public.set_user_auth_identities_updated_at();
