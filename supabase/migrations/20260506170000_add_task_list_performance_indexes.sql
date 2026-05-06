-- Add indexes for high-concurrency task list reads.
-- Use CONCURRENTLY for production safety when applying outside a transaction.

CREATE INDEX CONCURRENTLY IF NOT EXISTS creative_tasks_user_updated_idx
  ON public.creative_tasks (user_id, updated_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS creative_tasks_user_status_updated_idx
  ON public.creative_tasks (user_id, status, updated_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS task_summaries_user_type_updated_idx
  ON public.task_summaries (user_id, task_type, updated_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS task_summaries_user_status_updated_idx
  ON public.task_summaries (user_id, status, updated_at DESC);
