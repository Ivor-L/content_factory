import { NextResponse } from "next/server";
import { getRequestUserContext } from "@/lib/authServer";
import prisma from "@/lib/prisma";
import { clearPosterImages } from "@/lib/posterJobs";
import { ensurePosterJobSchema } from "@/lib/posterJobSchema";

type RouteParams = { jobId: string };
type RouteContext =
  | { params: RouteParams }
  | { params: Promise<RouteParams> };

const resolveParams = async (context: RouteContext): Promise<RouteParams> => {
  const raw = context.params as RouteParams | Promise<RouteParams>;
  if (typeof (raw as Promise<RouteParams>).then === "function") {
    return raw as Promise<RouteParams>;
  }
  return raw as RouteParams;
};

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { userId } = await getRequestUserContext(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { jobId } = await resolveParams(context);
    if (!jobId) {
      return NextResponse.json({ error: "Missing poster job id" }, { status: 400 });
    }

    await ensurePosterJobSchema();

    const job = await prisma.xhsPosterJob.findFirst({
      where: { id: jobId, userId },
      include: { images: true },
    });
    if (!job) {
      return NextResponse.json({ error: "Poster job not found" }, { status: 404 });
    }

    if (job.images.length) {
      await clearPosterImages(job.images);
    }
    await prisma.xhsPosterJob.delete({ where: { id: job.id } });

    return NextResponse.json({ data: { id: job.id } });
  } catch (error) {
    console.error("Failed to delete poster job", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete poster job" },
      { status: 500 }
    );
  }
}
