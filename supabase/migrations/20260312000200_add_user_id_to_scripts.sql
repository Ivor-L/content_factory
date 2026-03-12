alter table if exists public.scripts
add column if not exists user_id uuid;
