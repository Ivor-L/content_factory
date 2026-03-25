BEGIN;

CREATE TABLE IF NOT EXISTS public.writing_styles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  name text NOT NULL,
  description text,
  channel text,
  status text NOT NULL DEFAULT 'ACTIVE',
  extraction_status text NOT NULL DEFAULT 'IDLE',
  current_profile_id uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.writing_style_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  style_id uuid NOT NULL REFERENCES public.writing_styles(id) ON DELETE CASCADE,
  user_id uuid,
  title text NOT NULL,
  channel text,
  source_type text,
  original_path text NOT NULL,
  status text NOT NULL DEFAULT 'READY',
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.writing_style_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  style_id uuid NOT NULL REFERENCES public.writing_styles(id) ON DELETE CASCADE,
  document_id uuid REFERENCES public.writing_style_documents(id) ON DELETE SET NULL,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  content_length integer NOT NULL DEFAULT 0,
  card_type text,
  risk_level text,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  score integer,
  status text NOT NULL DEFAULT 'ACTIVE',
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.writing_style_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  style_id uuid NOT NULL REFERENCES public.writing_styles(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'READY',
  profile_json jsonb,
  sample_gaps text,
  sample_improvement text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT writing_style_profiles_style_version_key UNIQUE (style_id, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS writing_styles_current_profile_id_key
  ON public.writing_styles(current_profile_id);

CREATE INDEX IF NOT EXISTS writing_style_documents_style_created_at_idx
  ON public.writing_style_documents(style_id, created_at DESC);

CREATE INDEX IF NOT EXISTS writing_style_chunks_style_created_at_idx
  ON public.writing_style_chunks(style_id, created_at DESC);

CREATE INDEX IF NOT EXISTS writing_style_chunks_document_chunk_index_idx
  ON public.writing_style_chunks(document_id, chunk_index);

CREATE INDEX IF NOT EXISTS writing_style_profiles_style_created_at_idx
  ON public.writing_style_profiles(style_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'writing_styles'
      AND constraint_name = 'writing_styles_current_profile_id_fkey'
  ) THEN
    ALTER TABLE public.writing_styles
      ADD CONSTRAINT writing_styles_current_profile_id_fkey
      FOREIGN KEY (current_profile_id)
      REFERENCES public.writing_style_profiles(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

COMMIT;
