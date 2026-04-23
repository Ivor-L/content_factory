-- Knowledge base folders/files/chunks + assistant conversations/messages

create table if not exists public.knowledge_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists knowledge_folders_user_updated_idx
  on public.knowledge_folders (user_id, updated_at desc);

create table if not exists public.knowledge_files (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid not null references public.knowledge_folders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  source_type text,
  status text not null default 'READY',
  original_path text not null,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists knowledge_files_folder_created_idx
  on public.knowledge_files (folder_id, created_at desc);

create index if not exists knowledge_files_user_created_idx
  on public.knowledge_files (user_id, created_at desc);

create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid not null references public.knowledge_folders(id) on delete cascade,
  file_id uuid not null references public.knowledge_files(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  content_length integer not null default 0,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists knowledge_chunks_folder_created_idx
  on public.knowledge_chunks (folder_id, created_at desc);

create index if not exists knowledge_chunks_file_chunk_idx
  on public.knowledge_chunks (file_id, chunk_index);

create table if not exists public.assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  assistant_mode text not null default 'xhs',
  folder_id uuid references public.knowledge_folders(id) on delete set null,
  model text,
  skills text[] not null default '{}'::text[],
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create index if not exists assistant_conversations_user_last_message_idx
  on public.assistant_conversations (user_id, last_message_at desc);

create index if not exists assistant_conversations_folder_idx
  on public.assistant_conversations (folder_id);

create table if not exists public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.assistant_conversations(id) on delete cascade,
  role text not null,
  content text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists assistant_messages_conversation_created_idx
  on public.assistant_messages (conversation_id, created_at);

-- Auto-update timestamps
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_knowledge_folders_updated_at on public.knowledge_folders;
create trigger trg_knowledge_folders_updated_at
before update on public.knowledge_folders
for each row execute function public.set_updated_at();

drop trigger if exists trg_knowledge_files_updated_at on public.knowledge_files;
create trigger trg_knowledge_files_updated_at
before update on public.knowledge_files
for each row execute function public.set_updated_at();

drop trigger if exists trg_knowledge_chunks_updated_at on public.knowledge_chunks;
create trigger trg_knowledge_chunks_updated_at
before update on public.knowledge_chunks
for each row execute function public.set_updated_at();

drop trigger if exists trg_assistant_conversations_updated_at on public.assistant_conversations;
create trigger trg_assistant_conversations_updated_at
before update on public.assistant_conversations
for each row execute function public.set_updated_at();

-- RLS
alter table public.knowledge_folders enable row level security;
alter table public.knowledge_files enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.assistant_conversations enable row level security;
alter table public.assistant_messages enable row level security;

drop policy if exists knowledge_folders_owner on public.knowledge_folders;
create policy knowledge_folders_owner on public.knowledge_folders
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists knowledge_files_owner on public.knowledge_files;
create policy knowledge_files_owner on public.knowledge_files
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists knowledge_chunks_owner on public.knowledge_chunks;
create policy knowledge_chunks_owner on public.knowledge_chunks
for all
using (
  exists (
    select 1
    from public.knowledge_folders f
    where f.id = knowledge_chunks.folder_id
      and f.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.knowledge_folders f
    where f.id = knowledge_chunks.folder_id
      and f.user_id = auth.uid()
  )
);

drop policy if exists assistant_conversations_owner on public.assistant_conversations;
create policy assistant_conversations_owner on public.assistant_conversations
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists assistant_messages_owner on public.assistant_messages;
create policy assistant_messages_owner on public.assistant_messages
for all
using (
  exists (
    select 1
    from public.assistant_conversations c
    where c.id = assistant_messages.conversation_id
      and c.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.assistant_conversations c
    where c.id = assistant_messages.conversation_id
      and c.user_id = auth.uid()
  )
);
