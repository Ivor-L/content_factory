DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'replications'
      AND column_name = 'input_params_old'
  ) THEN
    ALTER TABLE public.replications
      RENAME COLUMN input_params_old TO input_params;
  END IF;
END $$;

ALTER TABLE public.replications
  ADD COLUMN IF NOT EXISTS input_params jsonb NOT NULL DEFAULT '{}'::jsonb;
