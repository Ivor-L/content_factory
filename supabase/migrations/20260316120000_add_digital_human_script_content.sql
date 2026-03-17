-- Ensure digital_human_videos keeps parity with Prisma schema
alter table if exists public.digital_human_videos
  add column if not exists script_content text;

comment on column public.digital_human_videos.script_content is 'Optional script used for VOICE_CLONE digital human jobs';
