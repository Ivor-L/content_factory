alter table if exists public.xhs_poster_jobs
  add column if not exists variation_count integer not null default 3;

update public.xhs_poster_jobs
  set variation_count = 3
  where variation_count is null;
