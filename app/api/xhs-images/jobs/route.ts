import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
import { ensurePosterJobSchema } from "@/lib/posterJobSchema";
import { serializePosterJob } from "@/lib/posterJobs";

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 100;

function clampLimit(value: number | null): number {
  if (!Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(value as number), 1), MAX_LIMIT);
}

function normalizeStatus(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length ? trimmed : null;
}

export async function GET(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limitParam = Number(searchParams.get("limit"));
  const statusParam = normalizeStatus(searchParams.get("status"));
  const beforeParam = searchParams.get("before");
  const beforeDate = beforeParam ? new Date(beforeParam) : null;
  const limit = clampLimit(Number.isFinite(limitParam) ? (limitParam as number) : null);

  await ensurePosterJobSchema();

  const jobs = await prisma.xhsPosterJob.findMany({
    where: {
      userId,
      ...(statusParam ? { status: statusParam } : {}),
      ...(beforeDate && !Number.isNaN(beforeDate.getTime())
        ? { createdAt: { lt: beforeDate } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      images: { orderBy: { sortOrder: "asc" } },
    },
    take: limit,
  });

  return NextResponse.json({
    data: jobs.map((job) => serializePosterJob(job)),
  });
}
