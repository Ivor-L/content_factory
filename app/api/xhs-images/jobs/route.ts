import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getRequestUserContext } from "@/lib/authServer";
import prisma from "@/lib/prisma";
import { serializePosterJob } from "@/lib/posterJobs";
import { ensurePosterJobSchema } from "@/lib/posterJobSchema";

const POSTER_TABLE_HINTS = ["xhs_poster_jobs", "xhs_poster_images", "variation_count"];
const POSTER_MODEL_HINTS = ["XhsPosterJob", "XhsPosterImage"];

const isPosterJobTableMissing = (error: unknown) => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2021") return true;
    if (
      error.code === "P2010" &&
      typeof error.meta?.modelName === "string" &&
      POSTER_MODEL_HINTS.includes(error.meta.modelName)
    ) {
      return true;
    }
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return POSTER_TABLE_HINTS.some((hint) => message.includes(hint));
  }
  return false;
};

const fetchPosterJobs = async (userId: string) => {
  const jobs = await prisma.xhsPosterJob.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { images: { orderBy: { sortOrder: "asc" } } },
  });
  return jobs.map((job) => serializePosterJob(job));
};

export async function GET(request: Request) {
  let userId: string | null = null;
  try {
    ({ userId } = await getRequestUserContext(request));
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await ensurePosterJobSchema();
    const data = await fetchPosterJobs(userId);
    return NextResponse.json({ data });
  } catch (error) {
    if (userId && isPosterJobTableMissing(error)) {
      try {
        await ensurePosterJobSchema({ force: true });
        const data = await fetchPosterJobs(userId);
        return NextResponse.json({ data });
      } catch (retryError) {
        console.error("Failed to self-heal poster job tables", retryError);
      }
    }
    console.error("Failed to load poster jobs", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load poster jobs" },
      { status: 500 }
    );
  }
}
