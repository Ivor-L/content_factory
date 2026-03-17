BEGIN;

ALTER TABLE public.history_docs
  ADD COLUMN IF NOT EXISTS latest_derivative_id uuid;

CREATE TABLE IF NOT EXISTS public.history_doc_derivatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  history_doc_id uuid NOT NULL REFERENCES public.history_docs(id) ON DELETE CASCADE,
  version text NOT NULL DEFAULT 'v1',
  style_summary jsonb,
  writing_blocks jsonb,
  case_bank jsonb,
  applicability jsonb,
  style_path text,
  blocks_path text,
  cases_path text,
  applicability_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS history_doc_derivatives_history_doc_id_idx
  ON public.history_doc_derivatives(history_doc_id);

ALTER TABLE public.history_docs
  ADD CONSTRAINT history_docs_latest_derivative_id_fkey
  FOREIGN KEY (latest_derivative_id)
  REFERENCES public.history_doc_derivatives(id)
  ON DELETE SET NULL;

COMMIT;
