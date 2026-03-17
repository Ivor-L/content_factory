create table if not exists public.user_referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references auth.users(id) on delete cascade,
  invitee_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  source text,
  metadata jsonb,
  notes text,
  constraint user_referrals_referrer_not_self check (referrer_id <> invitee_id)
);

create unique index if not exists user_referrals_invitee_unique on public.user_referrals(invitee_id);
create index if not exists user_referrals_referrer_idx on public.user_referrals(referrer_id);

alter table public.user_referrals enable row level security;

create policy if not exists "invitee_can_insert_binding" on public.user_referrals
  for insert
  with check (auth.uid() = invitee_id);

create policy if not exists "referrer_invitee_can_select" on public.user_referrals
  for select
  using (auth.uid() = referrer_id or auth.uid() = invitee_id);

create policy if not exists "referrer_can_delete_binding" on public.user_referrals
  for delete
  using (auth.uid() = referrer_id);
