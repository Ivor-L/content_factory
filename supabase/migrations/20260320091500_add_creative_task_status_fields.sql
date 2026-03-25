-- Add missing creative_tasks columns for progress tracking and webhook payloads
alter table public.creative_tasks
    add column if not exists progress integer not null default 0,
    add column if not exists layout_result_json jsonb,
    add column if not exists generated_images_json jsonb,
    add column if not exists error_message text;
