import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateReplication } from "@/lib/n8n";
import { getRequestUserContext } from '@/lib/authServer';
import { hydrateViralReferenceMedia } from "@/lib/viralReferenceMedia";
import { syncTaskToSummary } from "@/lib/taskSummary";

const resolvePrimaryProductImage = (images?: string | null): string | null => {
  if (!images) return null;
  try {
    const parsed = JSON.parse(images);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const first = parsed[0];
      if (typeof first === "string" && first.trim()) return first.trim();
      if (first && typeof first.url === "string") return first.url.trim();
    }
    if (typeof parsed === "string" && parsed.trim()) {
      return parsed.trim();
    }
  } catch (error) {
    const candidates = images
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (candidates.length > 0) {
      return candidates[0];
    }
  }
  return null;
};

type JsonRecord = Record<string, unknown>;

const safeJsonParse = <T = unknown>(input: unknown): T | null => {
  if (input == null) return null;
  if (typeof input === "object") return input as T;
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    return null;
  }
};

const hasStructuredProductInfo = (value: unknown): value is JsonRecord => {
  if (!value || typeof value !== "object") return false;
  if ("product_name" in value || "marketing_profile" in value || "visual_description" in value) {
    return true;
  }
  return false;
};

type MarketingPoint = {
  type: string;
  description: string;
  visual_proof: string;
};

const normalizeSellingPoints = (raw: unknown): MarketingPoint[] => {
  const parsed = safeJsonParse<unknown[]>(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((point, index): MarketingPoint | null => {
      if (point == null) return null;
      const text =
        typeof point === "string"
          ? point
          : typeof point === "number" || typeof point === "boolean"
            ? String(point)
            : typeof point === "object"
              ? JSON.stringify(point)
              : "";
      const description = text.trim();
      if (!description) return null;
      return {
        type: `Point ${index + 1}`,
        description,
        visual_proof: "",
      };
    })
    .filter((value): value is MarketingPoint => Boolean(value));
};

const buildProductInfoPayload = (product: any): JsonRecord => {
  const structured = safeJsonParse<JsonRecord>(product.analysisResult);
  if (structured && hasStructuredProductInfo(structured)) {
    return structured;
  }

  const fallbackPoints = normalizeSellingPoints(product.sellingPoints);
  return {
    product_name: product.name,
    visual_description: product.description,
    marketing_profile: {
      target_audience_vibe: product.sellingPointsText || "",
      ideal_environment: "",
      core_selling_points: fallbackPoints,
    },
  };
};

const resolveBlueprintPayload = (
  primary?: unknown,
  secondary?: unknown,
  fallback?: unknown,
): string | JsonRecord | null => {
  const candidate = primary ?? secondary ?? fallback;
  if (!candidate) return null;

  if (typeof candidate === "string") {
    const trimmed = candidate.trim();
    if (!trimmed) return null;
    const parsed = safeJsonParse<JsonRecord>(trimmed);
    return parsed ?? trimmed;
  }

  if (typeof candidate === "object") {
    return candidate as JsonRecord;
  }

  return String(candidate);
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
        productId,
        scriptId,
        targetCountry,
        targetLanguage,
        duration,
        quantity,
        blueprint,
        referenceId,
        creatorId,
        soraProvider,
        videoModel,
        aspectRatio,
        cityStyle,
    } = body;

    if (!productId || !scriptId) {
      return NextResponse.json({ error: "Missing productId or scriptId" }, { status: 400 });
    }

    const { userId, apiKey: resolvedApiKey } = await getRequestUserContext(request);
    let apiKey = resolvedApiKey || undefined;

    if (!apiKey && process.env.DEFAULT_USER_API_KEY) {
      apiKey = process.env.DEFAULT_USER_API_KEY;
    }

    if (!apiKey) {
        console.warn("API Key not found for user and DEFAULT_USER_API_KEY not set. n8n workflow may fail.");
    }

    const product = await prisma.product.findUnique({ where: { id: productId } });
    const script = await prisma.script.findUnique({ where: { id: scriptId } });

    if (!product || !script) {
      return NextResponse.json({ error: "Product or Script not found" }, { status: 404 });
    }

    let referenceRecord = null;
    if (referenceId) {
      referenceRecord = await prisma.viralReferenceItem.findUnique({
        where: { id: referenceId },
        include: { creator: true },
      });
    }

    const hydratedReferenceRecord = referenceRecord
      ? hydrateViralReferenceMedia(referenceRecord)
      : null;

    let creatorRecord = hydratedReferenceRecord?.creator ?? null;
    if (!creatorRecord && creatorId) {
      creatorRecord = await prisma.viralCreator.findUnique({ where: { id: creatorId } });
    }

    const referenceSnapshot = hydratedReferenceRecord
      ? {
          id: hydratedReferenceRecord.id,
          platform: hydratedReferenceRecord.platform,
          sourceId: hydratedReferenceRecord.sourceId,
          title: hydratedReferenceRecord.title,
          coverUrl: hydratedReferenceRecord.coverUrl,
          videoUrl: hydratedReferenceRecord.videoUrl,
          mediaUrls: hydratedReferenceRecord.mediaUrls,
          sourceUrl: hydratedReferenceRecord.sourceUrl,
          stats: hydratedReferenceRecord.stats,
          category: hydratedReferenceRecord.category,
          author: hydratedReferenceRecord.author,
        }
      : null;

    const creatorSnapshot = creatorRecord
      ? {
          id: creatorRecord.id,
          creatorHandle: creatorRecord.creatorHandle,
          displayName: creatorRecord.displayName,
          avatarUrl: creatorRecord.avatarUrl,
          profileUrl: creatorRecord.profileUrl,
          stats: creatorRecord.stats,
          platform: creatorRecord.platform,
        }
      : null;

    const replication = await prisma.replication.create({
      data: {
        status: "pending",
        result: "{}",
        type: "FULL",
        product: { connect: { id: productId } },
        script: { connect: { id: scriptId } },
      },
    });

    const productSnapshot = {
      id: product.id,
      name: product.name,
      images: product.images,
      description: product.description,
      sellingPoints: product.sellingPoints,
      sellingPointsText: (product as any).sellingPointsText ?? null,
    };

    const scriptSnapshot = {
      id: script.id,
      title: script.title,
      videoUrl: script.videoUrl,
      breakdown: script.breakdown,
      blueprint: script.blueprint,
    };

    const productInfoPayload = buildProductInfoPayload(product);
    const blueprintPayload = resolveBlueprintPayload(blueprint, script.blueprint, script.breakdown);
    const resolvedCityStyle = typeof cityStyle === "string" ? cityStyle.trim() : "";
    const resolvedVideoModel = typeof videoModel === "string" && videoModel.trim() ? videoModel.trim() : undefined;
    const resolvedAspectRatio = typeof aspectRatio === "string" && aspectRatio.trim() ? aspectRatio.trim() : undefined;
    const workflowIdForCredits =
      process.env.N8N_REPLICATION_WORKFLOW_ID_FOR_CREDITS?.trim() || "flow_farm_copy";

    await prisma.replication.update({
      where: { id: replication.id },
      data: {
        inputParams: {
          targetCountry: targetCountry || 'us',
          targetLanguage: targetLanguage || 'en',
          duration: duration || '15',
          quantity: quantity || '1',
          blueprint: blueprint || null,
          userId,
          productSnapshot,
          scriptSnapshot,
          reference: referenceSnapshot,
          creator: creatorSnapshot,
        },
      },
    });

    await syncTaskToSummary({
      taskType: 'replication',
      taskId: replication.id,
      operation: 'create',
    });

    const callbackUrl = `${process.env.N8N_CALLBACK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/webhook/replication`;
    const productImageUrl = resolvePrimaryProductImage(product.images);

    const scriptForTrigger = blueprint ? { ...script, blueprint } : script;

    const triggerOptions = {
      targetCountry: targetCountry || 'us',
      targetLanguage: targetLanguage || 'en',
      duration: duration || '15',
      quantity: quantity || '1',
      apiKey,
      userId: userId ?? undefined,
      callbackUrl,
      replicationId: replication.id,
      productImageUrl,
      referenceId: referenceSnapshot?.id,
      creatorId: creatorSnapshot?.id,
      referenceSnapshot,
      creatorSnapshot,
      soraProvider: soraProvider || 'kie',
      productInfo: productInfoPayload,
      blueprint: blueprintPayload ?? undefined,
      productName: product.name,
      cityStyle: resolvedCityStyle || undefined,
      workflowIdForCredits,
      aspectRatio: resolvedAspectRatio || 'portrait',
      model: resolvedVideoModel || undefined,
      nFrames: duration || '15',
    };

    try {
      await generateReplication(product, scriptForTrigger, triggerOptions);
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      console.error("Replication workflow trigger failed", normalizedError);
      await prisma.replication.update({
        where: { id: replication.id },
        data: { status: "failed", result: JSON.stringify({ error: normalizedError.message }) }
      });
      return NextResponse.json({ error: normalizedError.message }, { status: 500 });
    }

    return NextResponse.json({ id: replication.id, status: "pending" });
  } catch (error) {
    console.error("Error creating replication:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
