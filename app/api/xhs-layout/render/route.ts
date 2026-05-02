import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
import { getAssetBucket } from "@/lib/storagePaths";
import { uploadToStorage } from "@/lib/storageUpload";
import { toInputJson } from "@/lib/jsonUtils";
import {
  buildRenderSvgs,
  buildRenderTitle,
  normalizeTemplateId,
  type CardTemplateId,
} from "@/lib/xhsLayoutEngine";

type RenderRequestBody = {
  markdown?: string;
  templateId?: string;
  styleKey?: string;
  title?: string;
  includeCover?: boolean;
  maxPages?: number;
};

function sanitizeText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n/g, "\n").trim().slice(0, maxLength);
}

function sanitizeTitle(value: unknown): string {
  if (typeof value !== "string") return "";
  return Array.from(value.replace(/\r\n/g, " ").trim()).slice(0, 28).join("");
}

function pickPreview(markdown: string): string {
  const cleaned = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 140);
}

function normalizeMaxPages(raw: unknown): number {
  if (typeof raw !== "number" || Number.isNaN(raw)) return 8;
  const rounded = Math.round(raw);
  return Math.min(Math.max(rounded, 1), 12);
}

function buildMetadata(input: {
  templateId: CardTemplateId;
  markdown: string;
  imageUrls: string[];
  publishTitle: string;
}): Record<string, unknown> {
  return {
    posterMode: "text2image",
    source: "miniapp_xhs_layout",
    engine: "web-template",
    xhsLayout: {
      templateId: input.templateId,
      markdown: input.markdown,
      images: input.imageUrls,
      title: input.publishTitle,
    },
  };
}

async function svgToPngBuffer(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg, "utf8"))
    .png({ quality: 100 })
    .toBuffer();
}

export async function POST(request: NextRequest) {
  const { userId, token } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as RenderRequestBody | null;
  const markdown = sanitizeText(body?.markdown, 24000);
  if (!markdown) {
    return NextResponse.json({ error: "markdown 不能为空" }, { status: 400 });
  }

  const templateId = normalizeTemplateId(body?.templateId || body?.styleKey);
  const requestedTitle = sanitizeTitle(body?.title);
  const renderTitle = requestedTitle || buildRenderTitle(markdown, "图文卡片");
  const includeCover = body?.includeCover !== false;
  const maxPages = normalizeMaxPages(body?.maxPages);
  const taskId = randomUUID();

  try {
    const svgs = buildRenderSvgs({
      markdown,
      templateId,
      title: renderTitle,
      includeCover,
      maxPages,
    });

    if (svgs.length === 0) {
      return NextResponse.json({ error: "模板渲染失败，请稍后重试" }, { status: 500 });
    }

    const folder = `xhs-layout/${userId}/${taskId}`;
    const bucket = getAssetBucket();
    const uploadedUrls: string[] = [];

    for (let i = 0; i < svgs.length; i += 1) {
      const png = await svgToPngBuffer(svgs[i]);
      const path = `${folder}/page-${String(i + 1).padStart(2, "0")}.png`;
      const uploadResult = await uploadToStorage({
        bucket,
        path,
        body: png,
        contentType: "image/png",
        accessToken: token,
      });
      uploadedUrls.push(uploadResult.publicUrl);
    }

    const metadata = buildMetadata({
      templateId,
      markdown,
      imageUrls: uploadedUrls,
      publishTitle: renderTitle,
    });

    await prisma.$transaction(async (tx) => {
      await tx.creativeTask.create({
        data: {
          id: taskId,
          userId,
          title: renderTitle,
          channel: "xhs",
          targetOutput: "poster",
          ideaText: markdown,
          status: "COMPLETED",
          progress: 100,
          generatedImagesJson: toInputJson(uploadedUrls) ?? undefined,
          metadata: toInputJson({
            custom: metadata,
          }) ?? undefined,
        },
      });

      await tx.taskSummary.upsert({
        where: { taskType_taskId: { taskType: "poster", taskId } },
        create: {
          userId,
          taskType: "poster",
          taskId,
          title: renderTitle,
          status: "COMPLETED",
          preview: pickPreview(markdown),
          thumbnailUrl: uploadedUrls[0] || null,
          progress: 100,
          metadata: toInputJson(metadata) ?? undefined,
        },
        update: {
          title: renderTitle,
          status: "COMPLETED",
          preview: pickPreview(markdown),
          thumbnailUrl: uploadedUrls[0] || null,
          progress: 100,
          metadata: toInputJson(metadata) ?? undefined,
          updatedAt: new Date(),
        },
      });
    });

    return NextResponse.json({
      data: {
        taskId,
        title: renderTitle,
        templateId,
        images: uploadedUrls,
      },
    });
  } catch (error) {
    console.error("[xhs-layout/render] failed", error);
    return NextResponse.json({ error: "模板渲染失败，请稍后重试" }, { status: 500 });
  }
}
