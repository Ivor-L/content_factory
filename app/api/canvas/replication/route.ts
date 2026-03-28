import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateReplication } from "@/lib/n8n";
import { getRequestUserContext } from "@/lib/authServer";

export async function POST(request: NextRequest) {
  try {
    const { userId, apiKey: resolvedApiKey } = await getRequestUserContext(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const apiKey = resolvedApiKey || process.env.DEFAULT_USER_API_KEY;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const {
      referenceVideoUrl,
      productId,
      targetCountry = "us",
      targetLanguage = "en",
      duration = "15",
      quantity = 1,
      // canvasNodePairs: [{textNodeId, videoNodeId}] stored for Realtime binding
      canvasNodePairs,
    } = body as Record<string, unknown>;

    if (!referenceVideoUrl || typeof referenceVideoUrl !== "string") {
      return NextResponse.json({ error: "Missing referenceVideoUrl" }, { status: 400 });
    }
    if (!productId || typeof productId !== "string") {
      return NextResponse.json({ error: "Missing productId" }, { status: 400 });
    }

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Create a temporary script record representing the reference video
    const tempScript = await prisma.script.create({
      data: {
        title: "Canvas Reference",
        videoUrl: referenceVideoUrl,
        breakdown: "",
        status: "completed",
        userId,
      },
    });

    const resolvedQuantity = Math.min(Math.max(parseInt(String(quantity || "1"), 10) || 1, 1), 10);
    const callbackUrl = `${process.env.N8N_CALLBACK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/webhook/replication`;
    const workflowIdForCredits = process.env.N8N_REPLICATION_WORKFLOW_ID_FOR_CREDITS?.trim() || "flow_farm_copy";

    // Create replication records
    const replications = await Promise.all(
      Array.from({ length: resolvedQuantity }, (_, i) =>
        prisma.replication.create({
          data: {
            status: "pending",
            result: JSON.stringify({
              canvasNodePairs: Array.isArray(canvasNodePairs) ? canvasNodePairs[i] ?? null : null,
            }),
            type: "FULL",
            product: { connect: { id: productId } },
            script: { connect: { id: tempScript.id } },
          },
        }),
      ),
    );

    const TRIGGER_INTERVAL_MS = 2000;
    for (let i = 0; i < replications.length; i++) {
      if (i > 0) await new Promise<void>((res) => setTimeout(res, TRIGGER_INTERVAL_MS));
      try {
        await generateReplication(product, tempScript, {
          targetCountry: String(targetCountry),
          targetLanguage: String(targetLanguage),
          duration: String(duration),
          quantity: "1",
          apiKey,
          userId: userId ?? undefined,
          callbackUrl,
          replicationId: replications[i].id,
          productImageUrl: null,
          soraProvider: "kie",
          workflowIdForCredits,
          aspectRatio: "portrait",
        });
      } catch (err) {
        console.error("[canvas/replication] trigger failed for", replications[i].id, err);
      }
    }

    return NextResponse.json({
      replications: replications.map((r, i) => ({
        id: r.id,
        ...(Array.isArray(canvasNodePairs) && canvasNodePairs[i]
          ? (canvasNodePairs[i] as Record<string, unknown>)
          : {}),
      })),
      quantity: resolvedQuantity,
    });
  } catch (error) {
    console.error("[canvas/replication] error", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
