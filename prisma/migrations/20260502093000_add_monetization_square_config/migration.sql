CREATE TABLE IF NOT EXISTS public.monetization_square_configs (
  id text PRIMARY KEY,
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  config jsonb NOT NULL,
  published boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  created_at timestamptz(6) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS monetization_square_configs_published_idx
  ON public.monetization_square_configs(published);
