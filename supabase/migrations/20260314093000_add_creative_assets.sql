-- Create voice profiles table
CREATE TABLE IF NOT EXISTS public.voice_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    channel TEXT,
    name TEXT,
    description TEXT,
    profile JSONB NOT NULL,
    preview_url TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS voice_profiles_user_idx ON public.voice_profiles(user_id);

-- Create history docs table (uploaded past articles / transcripts)
CREATE TABLE IF NOT EXISTS public.history_docs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    channel TEXT,
    title TEXT NOT NULL,
    description TEXT,
    source_type TEXT,
    original_path TEXT NOT NULL,
    insights_path TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    metadata JSONB,
    voice_profile_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT history_docs_voice_profile_id_fkey
        FOREIGN KEY (voice_profile_id)
        REFERENCES public.voice_profiles (id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS history_docs_user_idx ON public.history_docs(user_id);
CREATE INDEX IF NOT EXISTS history_docs_channel_idx ON public.history_docs(channel);

-- Create story assets table
CREATE TABLE IF NOT EXISTS public.story_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    title TEXT NOT NULL,
    summary TEXT,
    channel TEXT,
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    content_path TEXT,
    structure JSONB,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS story_assets_user_idx ON public.story_assets(user_id);

-- Create style presets table
CREATE TABLE IF NOT EXISTS public.style_presets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    preview_url TEXT,
    spec JSONB NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS style_presets_user_idx ON public.style_presets(user_id);

-- Creative tasks master table
CREATE TABLE IF NOT EXISTS public.creative_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    title TEXT,
    channel TEXT,
    target_output TEXT,
    idea_text TEXT,
    stage TEXT NOT NULL DEFAULT 'diagnosis',
    status TEXT NOT NULL DEFAULT 'active',
    goal JSONB,
    metadata JSONB,
    outline_path TEXT,
    draft_path TEXT,
    artifacts JSONB,
    voice_profile_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT creative_tasks_voice_profile_id_fkey
        FOREIGN KEY (voice_profile_id)
        REFERENCES public.voice_profiles (id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS creative_tasks_user_idx ON public.creative_tasks(user_id);
CREATE INDEX IF NOT EXISTS creative_tasks_stage_idx ON public.creative_tasks(stage);

-- Creative events for audit & async coordination
CREATE TABLE IF NOT EXISTS public.creative_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.creative_tasks(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS creative_events_task_idx ON public.creative_events(task_id);

-- Junction tables for linking assets to tasks
CREATE TABLE IF NOT EXISTS public.creative_task_history_docs (
    task_id UUID NOT NULL REFERENCES public.creative_tasks(id) ON DELETE CASCADE,
    history_doc_id UUID NOT NULL REFERENCES public.history_docs(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (task_id, history_doc_id)
);

CREATE TABLE IF NOT EXISTS public.creative_task_stories (
    task_id UUID NOT NULL REFERENCES public.creative_tasks(id) ON DELETE CASCADE,
    story_id UUID NOT NULL REFERENCES public.story_assets(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (task_id, story_id)
);

CREATE TABLE IF NOT EXISTS public.creative_task_styles (
    task_id UUID NOT NULL REFERENCES public.creative_tasks(id) ON DELETE CASCADE,
    style_id UUID NOT NULL REFERENCES public.style_presets(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (task_id, style_id)
);
