CREATE TABLE IF NOT EXISTS public.earn_tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'publish',
  status TEXT NOT NULL DEFAULT 'draft',
  platforms JSONB DEFAULT '[]'::jsonb,
  cover_url TEXT,
  reward_amount INTEGER NOT NULL DEFAULT 0,
  max_participants INTEGER NOT NULL DEFAULT 0,
  current_participants INTEGER NOT NULL DEFAULT 0,
  deadline_at TIMESTAMP(3),
  keep_seconds INTEGER NOT NULL DEFAULT 0,
  requires_plugin BOOLEAN NOT NULL DEFAULT false,
  requires_shopping_cart BOOLEAN NOT NULL DEFAULT false,
  requirements JSONB DEFAULT '{}'::jsonb,
  action_config JSONB DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.earn_task_materials (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES public.earn_tasks(id) ON DELETE CASCADE,
  title TEXT,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'mixed',
  payload JSONB DEFAULT '{}'::jsonb,
  used_count INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.earn_user_tasks (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES public.earn_tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  platform TEXT NOT NULL,
  platform_uid TEXT NOT NULL DEFAULT '',
  platform_account_name TEXT,
  task_material_id TEXT REFERENCES public.earn_task_materials(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'doing',
  submission_url TEXT,
  screenshot_urls JSONB DEFAULT '[]'::jsonb,
  plugin_evidence JSONB DEFAULT '{}'::jsonb,
  qr_code_scan_result TEXT,
  submission_time TIMESTAMP(3),
  reviewed_by UUID,
  reviewed_at TIMESTAMP(3),
  review_note TEXT,
  reward_amount INTEGER NOT NULL DEFAULT 0,
  rewarded_at TIMESTAMP(3),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.earn_plugin_accounts (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  platform TEXT NOT NULL,
  platform_uid TEXT NOT NULL,
  nickname TEXT,
  avatar_url TEXT,
  status TEXT NOT NULL DEFAULT 'usable',
  last_seen_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.earn_plugin_events (
  id TEXT PRIMARY KEY,
  user_id UUID,
  event_type TEXT NOT NULL,
  platform TEXT,
  request_id TEXT,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS earn_user_tasks_unique_account
  ON public.earn_user_tasks(task_id, user_id, platform, platform_uid);

CREATE UNIQUE INDEX IF NOT EXISTS earn_plugin_accounts_unique
  ON public.earn_plugin_accounts(user_id, platform, platform_uid);

CREATE INDEX IF NOT EXISTS earn_tasks_status_type_idx
  ON public.earn_tasks(status, type);

CREATE INDEX IF NOT EXISTS earn_tasks_deadline_at_idx
  ON public.earn_tasks(deadline_at);

CREATE INDEX IF NOT EXISTS earn_tasks_created_at_idx
  ON public.earn_tasks(created_at);

CREATE INDEX IF NOT EXISTS earn_task_materials_task_id_enabled_used_count_idx
  ON public.earn_task_materials(task_id, enabled, used_count);

CREATE INDEX IF NOT EXISTS earn_user_tasks_user_id_status_updated_at_idx
  ON public.earn_user_tasks(user_id, status, updated_at);

CREATE INDEX IF NOT EXISTS earn_user_tasks_task_id_status_idx
  ON public.earn_user_tasks(task_id, status);

CREATE INDEX IF NOT EXISTS earn_user_tasks_status_updated_at_idx
  ON public.earn_user_tasks(status, updated_at);

CREATE INDEX IF NOT EXISTS earn_plugin_accounts_user_id_status_idx
  ON public.earn_plugin_accounts(user_id, status);

CREATE INDEX IF NOT EXISTS earn_plugin_events_user_id_created_at_idx
  ON public.earn_plugin_events(user_id, created_at);

CREATE INDEX IF NOT EXISTS earn_plugin_events_event_type_created_at_idx
  ON public.earn_plugin_events(event_type, created_at);

DO $$
BEGIN
  IF to_regclass('public.credit_configs') IS NOT NULL THEN
    INSERT INTO public.credit_configs (
      id,
      "featureKey",
      "featureName",
      category,
      amount,
      enabled,
      description,
      created_at,
      updated_at
    )
    VALUES
      ('earn_task_apply_default', 'earn_task_apply', '淘金任务接单', 'earn', 0, true, '淘金广场接单动作，默认免费，可在后台调整。', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('earn_task_submit_evidence_default', 'earn_task_submit_evidence', '淘金任务提交证据', 'earn', 0, true, '淘金广场任务提交链接、截图或插件证据，默认免费。', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('plugin_xhs_collect_default', 'plugin_xhs_collect', '插件小红书采集', 'plugin', 0, true, '浏览器插件采集用户当前小红书页面，默认免费。', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('plugin_xhs_publish_default', 'plugin_xhs_publish', '插件小红书发布辅助', 'plugin', 0, true, '浏览器插件辅助发布小红书内容，默认免费。', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('plugin_douyin_collect_default', 'plugin_douyin_collect', '插件抖音采集', 'plugin', 0, true, '浏览器插件采集抖音内容，默认免费。', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('plugin_douyin_publish_default', 'plugin_douyin_publish', '插件抖音发布辅助', 'plugin', 0, true, '浏览器插件辅助发布抖音内容，默认免费。', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('earn_agent_task_match_default', 'earn_agent_task_match', '淘金任务 Agent 匹配', 'earn_agent', 0, true, 'Agent 帮用户匹配适合任务，默认免费。', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('earn_agent_content_generate_default', 'earn_agent_content_generate', '淘金任务 Agent 内容生成', 'earn_agent', 1, true, 'Agent 根据任务生成标题、正文、标签或脚本。', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("featureKey") DO NOTHING;
  END IF;
END $$;
