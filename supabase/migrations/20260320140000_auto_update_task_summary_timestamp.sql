-- Ensure task_summaries.updated_at is always set
update public.task_summaries
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

alter table public.task_summaries
  alter column updated_at set default now();

create or replace function public.set_task_summary_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := coalesce(new.updated_at, now());
  return new;
end;
$$;

drop trigger if exists trg_task_summaries_set_updated_at on public.task_summaries;
create trigger trg_task_summaries_set_updated_at
before update on public.task_summaries
for each row
execute function public.set_task_summary_updated_at();
