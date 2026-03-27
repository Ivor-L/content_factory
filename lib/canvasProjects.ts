import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import prisma from './prisma';

export type CanvasViewport = { x: number; y: number; zoom: number };
export type CanvasData = {
  nodes: unknown[];
  edges: unknown[];
  viewport: CanvasViewport;
};

export type CanvasProjectResponse = {
  id: string;
  name: string;
  thumbnail: string;
  canvasData: CanvasData;
  createdAt: string;
  updatedAt: string;
};

export type CanvasProjectInput = {
  name?: string;
  thumbnail?: string | null;
  canvasData?: unknown;
};

type CanvasProjectRow = {
  id: string;
  userId: string;
  name: string;
  thumbnail: string | null;
  canvasData: unknown | null;
  createdAt: Date;
  updatedAt: Date;
};

type CanvasProjectTableRow = {
  id: string;
  user_id: string;
  name: string;
  thumbnail: string | null;
  canvas_data: unknown | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type CanvasProjectDelegate = {
  findMany: (args: unknown) => Promise<CanvasProjectRow[]>;
  findFirst: (args: unknown) => Promise<CanvasProjectRow | null>;
  create: (args: unknown) => Promise<CanvasProjectRow>;
  update: (args: unknown) => Promise<CanvasProjectRow>;
  delete: (args: unknown) => Promise<CanvasProjectRow>;
};

type CanvasProjectPersistenceData = {
  name: string;
  thumbnail: string | null;
  canvasData: CanvasData;
};

type CanvasProjectUpdateData = Partial<CanvasProjectPersistenceData>;

const prismaWithOptionalDelegate = prisma as typeof prisma & {
  canvasProject?: CanvasProjectDelegate;
};

const canvasProjectDelegate = prismaWithOptionalDelegate.canvasProject ?? null;
const usingRawFallback = !canvasProjectDelegate;

if (usingRawFallback && process.env.NODE_ENV !== 'test') {
  console.warn(
    '[canvasProjects] Prisma client is missing the canvasProject delegate. Falling back to raw SQL. Run `npx prisma generate` to sync the client with the schema.',
  );
}

function generateProjectId() {
  return randomUUID().replace(/-/g, '');
}

let ensureTablePromise: Promise<void> | null = null;

async function ensureCanvasProjectsTable() {
  if (!ensureTablePromise) {
    ensureTablePromise = (async () => {
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "public"."canvas_projects" (
          "id" TEXT NOT NULL,
          "user_id" UUID NOT NULL,
          "name" TEXT NOT NULL DEFAULT '',
          "thumbnail" TEXT,
          "canvas_data" JSONB,
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "canvas_projects_pkey" PRIMARY KEY ("id")
        )
      `;
      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS "canvas_projects_user_id_idx"
        ON "public"."canvas_projects" ("user_id")
      `;
    })().catch((error) => {
      ensureTablePromise = null;
      throw error;
    });
  }
  return ensureTablePromise;
}

export const DEFAULT_CANVAS_VIEWPORT: CanvasViewport = { x: 100, y: 50, zoom: 0.8 };
export const EMPTY_CANVAS_DATA: CanvasData = {
  nodes: [],
  edges: [],
  viewport: DEFAULT_CANVAS_VIEWPORT,
};

const MAX_PROJECT_NAME_LENGTH = 200;

function includesMissingRelationMessage(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes('42p01')) return true;
  if (normalized.includes('undefined_table')) return true;
  if (
    normalized.includes('relation') &&
    normalized.includes('canvas_projects') &&
    normalized.includes('does not exist')
  ) {
    return true;
  }
  return false;
}

function isMissingCanvasProjectsTableError(error: unknown) {
  if (!error) return false;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const meta = (error.meta ?? {}) as Record<string, unknown>;
    const metaCode = typeof meta.code === 'string' ? meta.code : undefined;
    if (metaCode && metaCode.toUpperCase() === '42P01') {
      return true;
    }
    if (includesMissingRelationMessage(error.message)) {
      return true;
    }
  }
  if (error instanceof Error && includesMissingRelationMessage(error.message)) {
    return true;
  }
  if (typeof error === 'string' && includesMissingRelationMessage(error)) {
    return true;
  }
  return false;
}

async function withCanvasProjectsTable<T>(callback: () => Promise<T>): Promise<T> {
  await ensureCanvasProjectsTable();
  try {
    return await callback();
  } catch (error) {
    if (isMissingCanvasProjectsTableError(error)) {
      ensureTablePromise = null;
      await ensureCanvasProjectsTable();
      return callback();
    }
    throw error;
  }
}

function coerceString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  return null;
}

function coerceViewport(value: unknown): CanvasViewport {
  if (value && typeof value === 'object') {
    const maybe = value as Partial<CanvasViewport>;
    const x = Number(maybe.x);
    const y = Number(maybe.y);
    const zoom = Number(maybe.zoom);
    return {
      x: Number.isFinite(x) ? x : DEFAULT_CANVAS_VIEWPORT.x,
      y: Number.isFinite(y) ? y : DEFAULT_CANVAS_VIEWPORT.y,
      zoom: Number.isFinite(zoom) ? zoom : DEFAULT_CANVAS_VIEWPORT.zoom,
    };
  }
  return DEFAULT_CANVAS_VIEWPORT;
}

function normalizeCanvasData(raw: unknown): CanvasData {
  if (!raw || typeof raw !== 'object') {
    return { ...EMPTY_CANVAS_DATA };
  }
  const source = raw as Partial<CanvasData>;
  const nodes = Array.isArray(source.nodes) ? source.nodes : [];
  const edges = Array.isArray(source.edges) ? source.edges : [];
  return {
    nodes,
    edges,
    viewport: coerceViewport(source.viewport),
  };
}

function sanitizeName(name?: string | null): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '未命名项目';
  return trimmed.slice(0, MAX_PROJECT_NAME_LENGTH);
}

function sanitizeThumbnail(thumbnail?: string | null): string | null {
  const value = coerceString(thumbnail);
  return value ?? null;
}

function toResponse(row: CanvasProjectRow): CanvasProjectResponse {
  return {
    id: row.id,
    name: row.name,
    thumbnail: row.thumbnail ?? '',
    canvasData: normalizeCanvasData(row.canvasData ?? undefined),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toRowFromSql(row: CanvasProjectTableRow): CanvasProjectRow {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    thumbnail: row.thumbnail ?? null,
    canvasData: row.canvas_data ?? null,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
  };
}

function buildPersistenceData(input: CanvasProjectInput): CanvasProjectPersistenceData {
  return {
    name: sanitizeName(input.name),
    thumbnail: sanitizeThumbnail(input.thumbnail),
    canvasData: normalizeCanvasData(input.canvasData),
  };
}

async function rawListCanvasProjects(userId: string, limit: number): Promise<CanvasProjectRow[]> {
  const rows = await prisma.$queryRaw<CanvasProjectTableRow[]>`
    SELECT id, user_id, name, thumbnail, canvas_data, created_at, updated_at
    FROM public.canvas_projects
    WHERE user_id = ${userId}
    ORDER BY updated_at DESC
    LIMIT ${limit}
  `;
  return rows.map(toRowFromSql);
}

async function rawListCanvasProjectsMeta(userId: string, limit: number): Promise<CanvasProjectRow[]> {
  const rows = await prisma.$queryRaw<CanvasProjectTableRow[]>`
    SELECT id, user_id, name, thumbnail, NULL::jsonb AS canvas_data, created_at, updated_at
    FROM public.canvas_projects
    WHERE user_id = ${userId}
    ORDER BY updated_at DESC
    LIMIT ${limit}
  `;
  return rows.map(toRowFromSql);
}

async function rawGetCanvasProject(userId: string, projectId: string): Promise<CanvasProjectRow | null> {
  const rows = await prisma.$queryRaw<CanvasProjectTableRow[]>`
    SELECT id, user_id, name, thumbnail, canvas_data, created_at, updated_at
    FROM public.canvas_projects
    WHERE user_id = ${userId} AND id = ${projectId}
    LIMIT 1
  `;
  return rows.length > 0 ? toRowFromSql(rows[0]) : null;
}

async function rawCreateCanvasProject(
  userId: string,
  data: CanvasProjectPersistenceData,
): Promise<CanvasProjectRow> {
  const projectId = generateProjectId();
  const rows = await prisma.$queryRaw<CanvasProjectTableRow[]>`
    INSERT INTO public.canvas_projects (id, user_id, name, thumbnail, canvas_data)
    VALUES (${projectId}, ${userId}, ${data.name}, ${data.thumbnail}, ${data.canvasData})
    RETURNING id, user_id, name, thumbnail, canvas_data, created_at, updated_at
  `;
  if (!rows.length) {
    throw new Error('Failed to create canvas project via SQL fallback');
  }
  return toRowFromSql(rows[0]);
}

async function rawUpdateCanvasProject(
  userId: string,
  projectId: string,
  data: CanvasProjectUpdateData,
): Promise<CanvasProjectRow | null> {
  const updates: Prisma.Sql[] = [];
  if (data.name !== undefined) {
    updates.push(Prisma.sql`name = ${data.name}`);
  }
  if (data.thumbnail !== undefined) {
    updates.push(Prisma.sql`thumbnail = ${data.thumbnail}`);
  }
  if (data.canvasData !== undefined) {
    updates.push(Prisma.sql`canvas_data = ${data.canvasData}`);
  }
  if (updates.length === 0) {
    return rawGetCanvasProject(userId, projectId);
  }
  updates.push(Prisma.sql`updated_at = NOW()`);

  const query = Prisma.sql`
    UPDATE public.canvas_projects
    SET ${Prisma.join(updates, ', ')}
    WHERE id = ${projectId} AND user_id = ${userId}
    RETURNING id, user_id, name, thumbnail, canvas_data, created_at, updated_at
  `;
  const rows = await prisma.$queryRaw<CanvasProjectTableRow[]>(query);
  return rows.length > 0 ? toRowFromSql(rows[0]) : null;
}

async function rawDeleteCanvasProject(userId: string, projectId: string): Promise<boolean> {
  const result = await prisma.$executeRaw`
    DELETE FROM public.canvas_projects
    WHERE id = ${projectId} AND user_id = ${userId}
  `;
  return typeof result === 'number' ? result > 0 : false;
}

export async function listCanvasProjects(userId: string, limit = 100): Promise<CanvasProjectResponse[]> {
  const take = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : 100;
  return withCanvasProjectsTable(async () => {
    if (canvasProjectDelegate) {
      const rows = await canvasProjectDelegate.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take,
      });
      return rows.map(toResponse);
    }
    const rows = await rawListCanvasProjects(userId, take);
    return rows.map(toResponse);
  });
}

export async function listCanvasProjectsMeta(userId: string, limit = 50): Promise<CanvasProjectResponse[]> {
  const take = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 200) : 50;
  return withCanvasProjectsTable(async () => {
    if (canvasProjectDelegate) {
      const rows = await canvasProjectDelegate.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take,
        select: { id: true, userId: true, name: true, thumbnail: true, createdAt: true, updatedAt: true },
      });
      return (rows as CanvasProjectRow[]).map((r) => ({
        id: r.id,
        name: r.name,
        thumbnail: r.thumbnail ?? '',
        canvasData: { nodes: [], edges: [], viewport: DEFAULT_CANVAS_VIEWPORT },
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      }));
    }
    const rows = await rawListCanvasProjectsMeta(userId, take);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      thumbnail: r.thumbnail ?? '',
      canvasData: { nodes: [], edges: [], viewport: DEFAULT_CANVAS_VIEWPORT },
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  });
}

export async function getCanvasProject(
  userId: string,
  projectId: string,
): Promise<CanvasProjectResponse | null> {
  return withCanvasProjectsTable(async () => {
    const row = canvasProjectDelegate
      ? await canvasProjectDelegate.findFirst({ where: { id: projectId, userId } })
      : await rawGetCanvasProject(userId, projectId);
    return row ? toResponse(row) : null;
  });
}

export async function createCanvasProject(
  userId: string,
  input: CanvasProjectInput,
): Promise<CanvasProjectResponse> {
  const data = buildPersistenceData(input);
  return withCanvasProjectsTable(async () => {
    if (canvasProjectDelegate) {
      const row = await canvasProjectDelegate.create({
        data: {
          userId,
          ...data,
        },
      });
      return toResponse(row);
    }
    const row = await rawCreateCanvasProject(userId, data);
    return toResponse(row);
  });
}

export async function updateCanvasProject(
  userId: string,
  projectId: string,
  input: CanvasProjectInput,
): Promise<CanvasProjectResponse | null> {
  return withCanvasProjectsTable(async () => {
    const existing = canvasProjectDelegate
      ? await canvasProjectDelegate.findFirst({ where: { id: projectId, userId } })
      : await rawGetCanvasProject(userId, projectId);
    if (!existing) return null;

    const data: CanvasProjectUpdateData = {};
    if (input.name !== undefined) {
      data.name = sanitizeName(input.name);
    }
    if (input.thumbnail !== undefined) {
      data.thumbnail = sanitizeThumbnail(input.thumbnail);
    }
    if (input.canvasData !== undefined) {
      data.canvasData = normalizeCanvasData(input.canvasData);
    }

    if (Object.keys(data).length === 0) {
      return toResponse(existing);
    }

    if (canvasProjectDelegate) {
      const row = await canvasProjectDelegate.update({
        where: { id: projectId },
        data,
      });
      return toResponse(row);
    }

    const row = await rawUpdateCanvasProject(userId, projectId, data);
    return row ? toResponse(row) : null;
  });
}

export async function deleteCanvasProject(userId: string, projectId: string): Promise<boolean> {
  return withCanvasProjectsTable(async () => {
    if (canvasProjectDelegate) {
      const existing = await canvasProjectDelegate.findFirst({ where: { id: projectId, userId } });
      if (!existing) return false;
      await canvasProjectDelegate.delete({ where: { id: projectId } });
      return true;
    }
    return rawDeleteCanvasProject(userId, projectId);
  });
}
