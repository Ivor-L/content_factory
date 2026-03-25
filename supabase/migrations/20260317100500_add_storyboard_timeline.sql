alter table if exists public.storyboard_tasks
  add column if not exists timeline jsonb;
