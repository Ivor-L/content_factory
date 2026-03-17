alter table public.replications
  add column if not exists input_params jsonb default '{}'::jsonb;
