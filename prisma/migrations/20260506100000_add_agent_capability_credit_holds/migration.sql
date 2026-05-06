CREATE TABLE IF NOT EXISTS public.agent_capability_credit_holds (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  capability_id TEXT NOT NULL,
  feature_key TEXT NOT NULL,
  estimated_credits INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'held',
  reason TEXT,
  metadata_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS agent_capability_credit_holds_user_id_idx
  ON public.agent_capability_credit_holds(user_id);

CREATE INDEX IF NOT EXISTS agent_capability_credit_holds_capability_id_idx
  ON public.agent_capability_credit_holds(capability_id);

CREATE INDEX IF NOT EXISTS agent_capability_credit_holds_status_idx
  ON public.agent_capability_credit_holds(status);
