create table if not exists public.viral_creators (
    id uuid primary key default gen_random_uuid(),
    platform text not null default 'xiaohongshu',
    creator_handle text,
    display_name text,
    avatar_url text,
    cover_url text,
    profile_url text,
    stats jsonb,
    bio text,
    tags jsonb,
    raw_payload jsonb,
    ingested_by text,
    ingested_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists viral_creators_platform_handle_key
    on public.viral_creators (platform, creator_handle)
    where creator_handle is not null;

create index if not exists viral_creators_platform_idx
    on public.viral_creators (platform);

create table if not exists public.viral_reference_items (
    id uuid primary key default gen_random_uuid(),
    platform text not null default 'xiaohongshu',
    source_type text,
    source_id text,
    source_url text,
    title text,
    description text,
    cover_url text,
    video_url text,
    media_urls jsonb,
    stats jsonb,
    author jsonb,
    user_tags jsonb,
    collector_version text,
    raw_payload jsonb,
    reference_hash text,
    category text,
    rank_label text,
    benchmark_score integer,
    remark text,
    flagged boolean not null default false,
    published_at timestamptz,
    ingested_by text,
    ingested_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    creator_id uuid references public.viral_creators (id) on delete set null
);

create unique index if not exists viral_reference_items_platform_source_id_key
    on public.viral_reference_items (platform, source_id)
    where source_id is not null;

create index if not exists viral_reference_items_platform_type_idx
    on public.viral_reference_items (platform, source_type);

create index if not exists viral_reference_items_category_idx
    on public.viral_reference_items (category);

create index if not exists viral_reference_items_published_idx
    on public.viral_reference_items (published_at desc);
