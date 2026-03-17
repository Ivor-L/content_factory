import prisma from "./prisma";

/**
 * Statements required to provision or patch the XHS poster tables. They are
 * intentionally idempotent so we can call them every time a new server worker
 * boots without worrying about duplicates.
 */
const POSTER_SCHEMA_SQL = [
  `create table if not exists public.xhs_poster_jobs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    title text,
    copy_text text not null,
    style_id uuid not null,
    style_name text,
    style_snapshot jsonb,
    variation_count integer not null default 3,
    status text not null default 'pending',
    error text,
    source_task_id uuid references public.creative_tasks(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );`,
  `create table if not exists public.xhs_poster_images (
    id uuid primary key default gen_random_uuid(),
    job_id uuid not null references public.xhs_poster_jobs(id) on delete cascade,
    image_url text not null,
    storage_path text not null,
    prompt text,
    sort_order integer not null default 0,
    created_at timestamptz not null default now()
  );`,
  `alter table if exists public.xhs_poster_jobs
    add column if not exists variation_count integer not null default 3;`,
  `update public.xhs_poster_jobs
    set variation_count = 3
    where variation_count is null;`,
  "create index if not exists xhs_poster_jobs_user_idx on public.xhs_poster_jobs(user_id);",
  "create index if not exists xhs_poster_jobs_source_task_idx on public.xhs_poster_jobs(source_task_id);",
  "create index if not exists xhs_poster_images_job_idx on public.xhs_poster_images(job_id);",
];

let ensurePosterJobSchemaPromise: Promise<void> | null = null;

async function applyPosterSchemaStatements() {
  for (const statement of POSTER_SCHEMA_SQL) {
    await prisma.$executeRawUnsafe(statement);
  }
}

export async function ensurePosterJobSchema(options?: { force?: boolean }) {
  if (!ensurePosterJobSchemaPromise || options?.force) {
    ensurePosterJobSchemaPromise = applyPosterSchemaStatements().catch((error) => {
      ensurePosterJobSchemaPromise = null;
      throw error;
    });
  }
  return ensurePosterJobSchemaPromise;
}
