-- Enable RLS and policies only when the target table exists.

DO $body$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'products') THEN

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'user_id') THEN
      RAISE NOTICE 'Skipping RLS setup for public.products; column user_id missing.';
      RETURN;
    END IF;
    ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'Users can view their own products') THEN
      EXECUTE 'CREATE POLICY "Users can view their own products" ON public.products FOR SELECT USING (auth.uid() = user_id)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'Users can insert their own products') THEN
      EXECUTE 'CREATE POLICY "Users can insert their own products" ON public.products FOR INSERT WITH CHECK (auth.uid() = user_id)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'Users can update their own products') THEN
      EXECUTE 'CREATE POLICY "Users can update their own products" ON public.products FOR UPDATE USING (auth.uid() = user_id)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'Users can delete their own products') THEN
      EXECUTE 'CREATE POLICY "Users can delete their own products" ON public.products FOR DELETE USING (auth.uid() = user_id)';
    END IF;
  ELSE
    RAISE NOTICE 'Skipping RLS setup for public.products; table not found.';
  END IF;
END
$body$;

DO $body$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'scripts') THEN

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'scripts' AND column_name = 'user_id') THEN
      RAISE NOTICE 'Skipping RLS setup for public.scripts; column user_id missing.';
      RETURN;
    END IF;
    ALTER TABLE public.scripts ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'scripts' AND policyname = 'Users can view their own scripts') THEN
      EXECUTE 'CREATE POLICY "Users can view their own scripts" ON public.scripts FOR SELECT USING (auth.uid() = user_id)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'scripts' AND policyname = 'Users can insert their own scripts') THEN
      EXECUTE 'CREATE POLICY "Users can insert their own scripts" ON public.scripts FOR INSERT WITH CHECK (auth.uid() = user_id)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'scripts' AND policyname = 'Users can update their own scripts') THEN
      EXECUTE 'CREATE POLICY "Users can update their own scripts" ON public.scripts FOR UPDATE USING (auth.uid() = user_id)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'scripts' AND policyname = 'Users can delete their own scripts') THEN
      EXECUTE 'CREATE POLICY "Users can delete their own scripts" ON public.scripts FOR DELETE USING (auth.uid() = user_id)';
    END IF;
  ELSE
    RAISE NOTICE 'Skipping RLS setup for public.scripts; table not found.';
  END IF;
END
$body$;

DO $body$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'characters') THEN

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'characters' AND column_name = 'user_id') THEN
      RAISE NOTICE 'Skipping RLS setup for public.characters; column user_id missing.';
      RETURN;
    END IF;
    ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'characters' AND policyname = 'Users can view their own characters') THEN
      EXECUTE 'CREATE POLICY "Users can view their own characters" ON public.characters FOR SELECT USING (auth.uid() = user_id)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'characters' AND policyname = 'Users can insert their own characters') THEN
      EXECUTE 'CREATE POLICY "Users can insert their own characters" ON public.characters FOR INSERT WITH CHECK (auth.uid() = user_id)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'characters' AND policyname = 'Users can update their own characters') THEN
      EXECUTE 'CREATE POLICY "Users can update their own characters" ON public.characters FOR UPDATE USING (auth.uid() = user_id)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'characters' AND policyname = 'Users can delete their own characters') THEN
      EXECUTE 'CREATE POLICY "Users can delete their own characters" ON public.characters FOR DELETE USING (auth.uid() = user_id)';
    END IF;
  ELSE
    RAISE NOTICE 'Skipping RLS setup for public.characters; table not found.';
  END IF;
END
$body$;

DO $body$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'digital_human_videos') THEN

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'digital_human_videos' AND column_name = 'user_id') THEN
      RAISE NOTICE 'Skipping RLS setup for public.digital_human_videos; column user_id missing.';
      RETURN;
    END IF;
    ALTER TABLE public.digital_human_videos ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'digital_human_videos' AND policyname = 'Users can view their own digital_human_videos') THEN
      EXECUTE 'CREATE POLICY "Users can view their own digital_human_videos" ON public.digital_human_videos FOR SELECT USING (auth.uid() = user_id)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'digital_human_videos' AND policyname = 'Users can insert their own digital_human_videos') THEN
      EXECUTE 'CREATE POLICY "Users can insert their own digital_human_videos" ON public.digital_human_videos FOR INSERT WITH CHECK (auth.uid() = user_id)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'digital_human_videos' AND policyname = 'Users can update their own digital_human_videos') THEN
      EXECUTE 'CREATE POLICY "Users can update their own digital_human_videos" ON public.digital_human_videos FOR UPDATE USING (auth.uid() = user_id)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'digital_human_videos' AND policyname = 'Users can delete their own digital_human_videos') THEN
      EXECUTE 'CREATE POLICY "Users can delete their own digital_human_videos" ON public.digital_human_videos FOR DELETE USING (auth.uid() = user_id)';
    END IF;
  ELSE
    RAISE NOTICE 'Skipping RLS setup for public.digital_human_videos; table not found.';
  END IF;
END
$body$;

DO $body$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'replications') THEN
    RAISE NOTICE 'Skipping RLS setup for public.replications; column user_id missing.';
  ELSE
    RAISE NOTICE 'Skipping RLS setup for public.replications; table not found.';
  END IF;
END
$body$;

DO $body$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'storyboard_tasks') THEN

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'storyboard_tasks' AND column_name = 'user_id') THEN
      RAISE NOTICE 'Skipping RLS setup for public.storyboard_tasks; column user_id missing.';
      RETURN;
    END IF;
    ALTER TABLE public.storyboard_tasks ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'storyboard_tasks' AND policyname = 'Users can view their own storyboard_tasks') THEN
      EXECUTE 'CREATE POLICY "Users can view their own storyboard_tasks" ON public.storyboard_tasks FOR SELECT USING (auth.uid() = user_id)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'storyboard_tasks' AND policyname = 'Users can insert their own storyboard_tasks') THEN
      EXECUTE 'CREATE POLICY "Users can insert their own storyboard_tasks" ON public.storyboard_tasks FOR INSERT WITH CHECK (auth.uid() = user_id)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'storyboard_tasks' AND policyname = 'Users can update their own storyboard_tasks') THEN
      EXECUTE 'CREATE POLICY "Users can update their own storyboard_tasks" ON public.storyboard_tasks FOR UPDATE USING (auth.uid() = user_id)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'storyboard_tasks' AND policyname = 'Users can delete their own storyboard_tasks') THEN
      EXECUTE 'CREATE POLICY "Users can delete their own storyboard_tasks" ON public.storyboard_tasks FOR DELETE USING (auth.uid() = user_id)';
    END IF;
  ELSE
    RAISE NOTICE 'Skipping RLS setup for public.storyboard_tasks; table not found.';
  END IF;
END
$body$;
