alter table if exists public.xhs_poster_jobs
  add column if not exists source_task_id uuid references public.creative_tasks(id) on delete set null;

create index if not exists xhs_poster_jobs_source_task_idx
  on public.xhs_poster_jobs(source_task_id);

alter table if exists public.digital_human_videos
  add column if not exists source_task_id uuid references public.creative_tasks(id) on delete set null;

create index if not exists digital_human_videos_source_task_idx
  on public.digital_human_videos(source_task_id);
