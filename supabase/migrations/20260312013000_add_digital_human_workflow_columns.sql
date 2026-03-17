-- Add optional metadata columns for billing logic
alter table if exists public.digital_human_videos
    add column if not exists duration_seconds double precision,
    add column if not exists workflow_id text;
