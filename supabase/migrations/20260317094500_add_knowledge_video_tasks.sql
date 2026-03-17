create table if not exists public.knowledge_video_tasks (
  id text primary key default cuid(),
  user_id uuid,
  title text,
  video_type text not null,
  script_content text,
  audio_url text,
  audio_duration double precision,
  theme_key text,
  status text not null default 'QUEUED',
  error text,
  video_url text,
  video_storage_path text,
  cover_url text,
  cover_storage_path text,
  duration_seconds double precision,
  timeline jsonb,
  metadata jsonb,
  render_stats jsonb,
  remotion_composition text,
  remotion_props jsonb,
  source_task_id uuid references public.creative_tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists knowledge_video_tasks_user_id_idx on public.knowledge_video_tasks(user_id);
create index if not exists knowledge_video_tasks_status_idx on public.knowledge_video_tasks(status);
create index if not exists knowledge_video_tasks_source_task_id_idx on public.knowledge_video_tasks(source_task_id);

comment on table public.knowledge_video_tasks is 'Tracks Remotion knowledge video renders (subtitle wrap and knowledge animation)';
comment on column public.knowledge_video_tasks.video_type is 'subtitle_wrap or knowledge_animation';
comment on column public.knowledge_video_tasks.timeline is 'structured scenes/segments timeline JSON';
comment on column public.knowledge_video_tasks.render_stats is 'render metadata from Remotion Lambda/Render Media';
comment on column public.knowledge_video_tasks.remotion_composition is 'Composition name used for render';
comment on column public.knowledge_video_tasks.remotion_props is 'Serialized props sent to Remotion';

