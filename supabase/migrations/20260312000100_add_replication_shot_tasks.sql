-- Create replication_shot_tasks table to support 分镜控制模式
CREATE TABLE IF NOT EXISTS public.replication_shot_tasks (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  script_id TEXT NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES public.products(id),
  character_id TEXT REFERENCES public.characters(id),
  scene_image_url TEXT,
  product_scene_image_url TEXT,
  shot_prompts JSONB,
  first_frames JSONB,
  end_frame_options JSONB,
  videos JSONB,
  final_video_url TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS replication_shot_tasks_user_id_idx ON public.replication_shot_tasks(user_id);
CREATE INDEX IF NOT EXISTS replication_shot_tasks_script_id_idx ON public.replication_shot_tasks(script_id);

-- Enable RLS and add basic policies
ALTER TABLE public.replication_shot_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own replication_shot_tasks" ON public.replication_shot_tasks
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own replication_shot_tasks" ON public.replication_shot_tasks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own replication_shot_tasks" ON public.replication_shot_tasks
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own replication_shot_tasks" ON public.replication_shot_tasks
  FOR DELETE USING (auth.uid() = user_id);
