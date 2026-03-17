create table if not exists public.xhs_poster_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text,
  copy_text text not null,
  style_id uuid not null,
  style_name text,
  style_snapshot jsonb,
  variation_count integer not null default 3,
  status text not null default 'pending',
  error text,
  source_task_id uuid references public.creative_tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.xhs_poster_images (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.xhs_poster_jobs(id) on delete cascade,
  image_url text not null,
  storage_path text not null,
  prompt text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists xhs_poster_jobs_user_idx on public.xhs_poster_jobs(user_id);
create index if not exists xhs_poster_jobs_source_task_idx on public.xhs_poster_jobs(source_task_id);
create index if not exists xhs_poster_images_job_idx on public.xhs_poster_images(job_id);
