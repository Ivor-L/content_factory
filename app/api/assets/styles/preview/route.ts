import { NextRequest, NextResponse } from "next/server";
import type { StylePreset } from "@prisma/client";
import { getRequestUserContext } from "@/lib/authServer";
import prisma from "@/lib/prisma";
import { generateXhsImages, type MinimalStyle } from "@/lib/xhsImageGenerator";

const MAX_PREVIEW_STYLES = 6;

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};

const toMinimalStyle = (style: StylePreset): MinimalStyle => ({
  id: style.id,
  name: style.name,
  type: style.type,
  description: style.description,
  spec: asRecord(style.spec),
  metadata: asRecord(style.metadata),
});

export async function POST(request: NextRequest) {
  try {
    const { userId } = await getRequestUserContext(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const copyText = typeof body.copyText === "string" ? body.copyText.trim() : "";
    if (!copyText) {
      return NextResponse.json({ error: "copyText is required" }, { status: 400 });
    }

    const rawStyleIds: string[] = Array.isArray(body.styleIds)
      ? body.styleIds
          .map((id: unknown) => (typeof id === "string" ? id.trim() : ""))
          .filter((id: string) => Boolean(id))
      : [];
    const uniqueStyleIds = Array.from(new Set<string>(rawStyleIds)).slice(0, MAX_PREVIEW_STYLES);

    let styles: StylePreset[] = [];
    if (uniqueStyleIds.length > 0) {
      styles = await prisma.stylePreset.findMany({
        where: {
          id: { in: uniqueStyleIds },
          OR: [{ userId }, { userId: null }],
        },
      });
    } else {
      styles = await prisma.stylePreset.findMany({
        where: { OR: [{ userId }, { userId: null }] },
        orderBy: [{ userId: "asc" }, { createdAt: "desc" }],
        take: MAX_PREVIEW_STYLES,
      });
    }

    if (!styles.length) {
      return NextResponse.json({ error: "No style presets available" }, { status: 404 });
    }

    const orderedStyles = (uniqueStyleIds.length
      ? uniqueStyleIds.map((id) => styles.find((style) => style.id === id))
      : styles
    ).filter((style): style is StylePreset => Boolean(style));

    const data: Array<{
      styleId: string;
      styleName?: string | null;
      imageUrl: string;
      prompt?: string;
    }> = [];
    const errors: Array<{ styleId: string; message: string }> = [];

    for (const style of orderedStyles) {
      try {
        const [poster] = await generateXhsImages({
          style: toMinimalStyle(style),
          copyText,
          variations: 1,
        });
        if (!poster) {
          throw new Error("Image generation result missing");
        }
        data.push({
          styleId: style.id,
          styleName: style.name,
          imageUrl: poster.imageUrl,
          prompt: poster.prompt,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to generate preview";
        errors.push({ styleId: style.id, message });
      }
    }

    if (!data.length) {
      const fallbackError = errors[0]?.message || "Failed to generate previews";
      return NextResponse.json({ error: fallbackError }, { status: 500 });
    }

    return NextResponse.json(errors.length ? { data, errors } : { data });
  } catch (error) {
    console.error("Failed to generate style previews", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate previews" },
      { status: 500 }
    );
  }
}
