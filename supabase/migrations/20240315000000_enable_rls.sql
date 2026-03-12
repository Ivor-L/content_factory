-- Enable RLS on tables
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digital_human_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.replications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storyboard_tasks ENABLE ROW LEVEL SECURITY;

-- Add user_id column if not exists (Prisma handles this, but good for SQL completeness)
-- Note: Prisma migrations will actually perform the ALTER TABLE ADD COLUMN

-- Create policies for products
CREATE POLICY "Users can view their own products" ON public.products
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own products" ON public.products
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own products" ON public.products
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own products" ON public.products
  FOR DELETE USING (auth.uid() = user_id);

-- Create policies for scripts
CREATE POLICY "Users can view their own scripts" ON public.scripts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own scripts" ON public.scripts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own scripts" ON public.scripts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own scripts" ON public.scripts
  FOR DELETE USING (auth.uid() = user_id);

-- Create policies for characters
CREATE POLICY "Users can view their own characters" ON public.characters
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own characters" ON public.characters
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own characters" ON public.characters
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own characters" ON public.characters
  FOR DELETE USING (auth.uid() = user_id);

-- Create policies for digital_human_videos
CREATE POLICY "Users can view their own digital_human_videos" ON public.digital_human_videos
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own digital_human_videos" ON public.digital_human_videos
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own digital_human_videos" ON public.digital_human_videos
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own digital_human_videos" ON public.digital_human_videos
  FOR DELETE USING (auth.uid() = user_id);

-- Create policies for replications
CREATE POLICY "Users can view their own replications" ON public.replications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own replications" ON public.replications
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own replications" ON public.replications
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own replications" ON public.replications
  FOR DELETE USING (auth.uid() = user_id);

-- Create policies for storyboard_tasks
CREATE POLICY "Users can view their own storyboard_tasks" ON public.storyboard_tasks
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own storyboard_tasks" ON public.storyboard_tasks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own storyboard_tasks" ON public.storyboard_tasks
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own storyboard_tasks" ON public.storyboard_tasks
  FOR DELETE USING (auth.uid() = user_id);

-- Service Role Policy (Optional but recommended for Admin access via API)
-- By default, service_role bypasses RLS, but if you ever use a client with RLS enforcement:
-- CREATE POLICY "Service role can do everything" ON public.products
--   FOR ALL TO service_role USING (true) WITH CHECK (true);
