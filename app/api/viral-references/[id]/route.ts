import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";

/** Returns scriptText for a single ViralReferenceItem, used by frontend polling. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId, apiKey } = await getRequestUserContext(request);
  if (!userId && !apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const item = await prisma.viralReferenceItem.findFirst({
    where: {
      id,
      ingestedBy: userId ?? apiKey!,
    },
    select: { id: true, rawPayload: true },
  });

  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rp = item.rawPayload;
  const scriptText =
    rp && typeof rp === "object" && !Array.isArray(rp)
      ? (typeof (rp as any).scriptText === "string" ? (rp as any).scriptText : null)
      : null;

  return NextResponse.json({ data: { id: item.id, scriptText } });
}
