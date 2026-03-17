import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateReplication, generateOneClickReplication } from "@/lib/n8n";
import { getRequestUserContext } from '@/lib/authServer';

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
        blueprint
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
        },
      },
    });

    const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/webhook/replication`;
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
      productImageUrl
    };

    let primaryError: Error | null = null;

    try {
      await generateOneClickReplication(product, scriptForTrigger, triggerOptions);
    } catch (error) {
      primaryError = error instanceof Error ? error : new Error(String(error));
      console.error("One-Click replication failed, attempting legacy flow", primaryError);
      try {
        await generateReplication(product, scriptForTrigger, triggerOptions);
        primaryError = null;
      } catch (legacyError) {
        const legacy = legacyError instanceof Error ? legacyError : new Error(String(legacyError));
        const message = primaryError
          ? `${primaryError.message}; legacy fallback failed: ${legacy.message}`
          : legacy.message;
        await prisma.replication.update({
          where: { id: replication.id },
          data: { status: "failed", result: JSON.stringify({ error: message }) }
        });
        return NextResponse.json({ error: message }, { status: 500 });
      }
    }

    return NextResponse.json({ id: replication.id, status: "pending" });
  } catch (error) {
    console.error("Error creating replication:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
