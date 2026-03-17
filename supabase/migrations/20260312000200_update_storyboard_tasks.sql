ALTER TABLE public.storyboard_tasks
  ADD COLUMN IF NOT EXISTS storyboard_image_url TEXT,
  ADD COLUMN IF NOT EXISTS storyboard_structure JSONB,
  ADD COLUMN IF NOT EXISTS progress INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_type TEXT,
  ADD COLUMN IF NOT EXISTS task_id TEXT,
  ADD COLUMN IF NOT EXISTS user_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS storyboard_tasks_task_id_key
  ON public.storyboard_tasks(task_id)
  WHERE task_id IS NOT NULL;
