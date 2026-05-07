import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
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
import { renderXhsCardLayout } from "@/lib/xhs-card-layout-service";

type RenderRequestBody = {
  markdown?: string;
  templateId?: string;
  styleKey?: string;
  title?: string;
  includeCover?: boolean;
  maxPages?: number;
  persist?: boolean;
  requirePreview?: boolean;
  preview?: {
    pages?: unknown;
    cardClassName?: unknown;
    cardStyle?: unknown;
    contentClassName?: unknown;
    contentStyle?: unknown;
    richTextClassName?: unknown;
    selectedCardStyle?: unknown;
  };
  cover?: {
    coverStyleId?: string;
    coverTitle?: string;
    coverSubtitle?: string;
    coverImage?: string;
    coverTextColor?: string;
    coverHighlightColor?: string;
    coverCardRadius?: number;
    coverShowStickers?: boolean;
    coverFontFamily?: string;
    coverTitleAlignX?: "left" | "center" | "right";
    coverTitleAlignY?: "top" | "center" | "bottom";
    coverFontSize?: number;
    coverSubtitleFontSize?: number;
    coverLineHeight?: number;
  };
};

export const runtime = "nodejs";

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
  const png = await sharp(Buffer.from(svg, "utf8"))
    .png({ quality: 100 })
    .toBuffer();
  const stats = await sharp(png).stats();
  const opaqueChannels = stats.channels.filter((channel) => channel.max > 0);
  if (png.length < 1024 || opaqueChannels.length === 0) {
    throw new Error("blank_png_rendered");
  }
  return png;
}

function sanitizeClassName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => /^[A-Za-z0-9_-]+$/.test(part))
    .slice(0, 12)
    .join(" ");
}

function appendPreviewCardClasses(className: string): string {
  const classes = new Set(
    className
      .split(/\s+/)
      .map((part) => part.trim())
      .filter(Boolean),
  );
  classes.delete("preview-card");
  return Array.from(classes).join(" ");
}

function sanitizePreviewHtml(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?<\/object>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .slice(0, 120000);
}

function normalizeCssValue(value: string): string {
  return value
    .replace(/url\((['"]?)(?!https?:|data:|\/)([^'")]+)\1\)/gi, "none")
    .replace(/(-?\d+(?:\.\d+)?)rpx\b/g, (_, raw: string) => `${Number(raw) * 0.5}px`);
}

function toCssPropertyName(key: string): string {
  if (key.startsWith("--")) return key;
  return key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function sanitizeStyleObject(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  return Object.entries(value as Record<string, unknown>)
    .filter(([key, raw]) => (
      /^[A-Za-z_-][A-Za-z0-9_-]*$/.test(key)
      && (typeof raw === "string" || typeof raw === "number")
    ))
    .slice(0, 48)
    .map(([key, raw]) => `${toCssPropertyName(key)}:${normalizeCssValue(String(raw)).replace(/[<>{}]/g, "")}`)
    .join(";");
}

function hasPreviewPayload(preview: RenderRequestBody["preview"]): boolean {
  return Array.isArray(preview?.pages)
    && preview.pages.some((page) => typeof page === "string" && page.trim().length > 0);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildPreviewExportHtml(input: {
  pageHtml: string;
  cardClassName: string;
  cardStyle: string;
  contentClassName: string;
  contentStyle: string;
  richTextClassName: string;
  selectedCardStyle: string;
}): string {
  const isAppleNotes = input.selectedCardStyle === "apple-notes";
  const appleHeader = isAppleNotes
    ? `<div class="preview-apple-header"><div class="preview-apple-header-left"><span class="preview-apple-header-icon">‹</span><span class="preview-apple-header-title">备忘录</span></div><div class="preview-apple-header-right"><span class="preview-apple-header-icon">↥</span><span class="preview-apple-header-icon">◌</span></div></div>`
    : "";

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
*{box-sizing:border-box}
html,body{margin:0;width:345px;height:490px;overflow:hidden;background:#101010}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif}
.preview-card{--preview-accent:#ecee9f;--preview-accent-soft:rgba(236,238,159,.18);--preview-title-gap:4px;width:345px;height:490px;border-radius:0!important;border:.5px solid rgba(144,165,200,.2);padding:11px;box-sizing:border-box;overflow:hidden;position:relative}
.preview-card .preview-richtext,.preview-card .preview-apple-header,.preview-card .preview-content-shell{position:relative;z-index:1}
.preview-content-shell{width:100%;height:100%;border-radius:0!important;padding:9px 10px;box-sizing:border-box;overflow:hidden;background:transparent}
.preview-content-shell--apple-notes{padding:0;border-radius:0;height:calc(100% - 23px)}
.preview-content-shell--instagram{border:.5px solid rgba(255,255,255,.32);box-shadow:inset 0 .5px 0 rgba(255,255,255,.2)}
.preview-content-shell--coil-notebook{border:.5px solid rgba(38,56,110,.12)}
.preview-content-shell--pop-art{border:1px solid rgba(16,16,21,.22)}
.preview-content-shell--business{border:.5px solid rgba(37,99,235,.14)}
.preview-content-shell--cyberpunk{border:.5px solid rgba(0,245,255,.34);box-shadow:inset 0 0 0 .5px rgba(255,0,170,.2)}
.preview-content-shell--meadow-dawn{border:.5px solid rgba(106,134,94,.2)}
.preview-card--style-apple-notes{border-color:rgba(207,178,91,.36)}
.preview-card--style-coil-notebook{border-color:rgba(255,255,255,.4);padding-left:20px}
.preview-card--style-coil-notebook::before{content:"";position:absolute;left:7px;top:15px;bottom:15px;width:5px;border-radius:999px;background-image:radial-gradient(circle,rgba(255,255,255,.8) 0 1.5px,transparent 1.75px);background-size:5px 17px;background-repeat:repeat-y;pointer-events:none}
.preview-card--style-pop-art{border-color:rgba(17,24,39,.44)}
.preview-card--style-bytedance{border-color:rgba(0,102,255,.28)}
.preview-card--style-art-deco{border-color:rgba(212,175,55,.52)}
.preview-card--style-glassmorphism{border-color:rgba(140,180,255,.44);box-shadow:inset 0 0 0 .5px rgba(255,255,255,.16)}
.preview-card--style-minimal,.preview-card--style-minimalist,.preview-card--style-business,.preview-card--style-japanese-magazine{border-color:rgba(120,134,156,.24)}
.preview-card--style-cyberpunk{border-color:rgba(0,245,255,.42)}
.preview-card--mode-light-mode{box-shadow:inset 0 0 0 .5px rgba(255,255,255,.2)}
.preview-card--mode-dark-mode,.preview-card--mode-night-mode,.preview-card--mode-black-mode,.preview-card--mode-purple-mode{box-shadow:inset 0 0 0 .5px rgba(255,255,255,.08)}
.preview-apple-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;color:#f8c744;font-size:11px}
.preview-apple-header-left,.preview-apple-header-right{display:flex;align-items:center;gap:4px}
.preview-apple-header-right{gap:8px}
.preview-apple-header-title{font-size:11px;font-weight:400}
.preview-apple-header-icon{font-size:12px;line-height:1}
.preview-richtext{display:block;height:100%;overflow:visible;padding-bottom:5px}
.preview-richtext--apple-notes{display:block;height:100%;box-sizing:border-box;padding-bottom:4px}
.preview-card--radius-sm,.preview-card--radius-md,.preview-card--radius-lg{border-radius:0!important}
.preview-card--export-fit .preview-richtext{transform-origin:top left}
img{max-width:100%}
table{border-collapse:collapse}
</style>
</head>
<body>
  <div class="preview-card preview-card--export-fit ${escapeHtml(appendPreviewCardClasses(input.cardClassName))}" style="${input.cardStyle}">
    ${appleHeader}
    <div class="${escapeHtml(input.contentClassName || "preview-content-shell")}" style="${input.contentStyle}">
      <div class="${escapeHtml(input.richTextClassName || "preview-richtext")}">${input.pageHtml}</div>
    </div>
  </div>
</body>
</html>`;
}

async function renderPreviewPagesToPngs(preview: NonNullable<RenderRequestBody["preview"]>): Promise<Buffer[]> {
  const pages = Array.isArray(preview.pages)
    ? preview.pages.map(sanitizePreviewHtml).filter(Boolean).slice(0, 12)
    : [];
  if (pages.length === 0) return [];

  const { chromium } = await import("playwright");
  const chromiumExecutableCandidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    process.env.CHROMIUM_EXECUTABLE_PATH,
    process.platform === "linux" ? "/usr/bin/chromium-browser" : undefined,
    process.platform === "linux" ? "/usr/bin/chromium" : undefined,
  ].filter((candidate): candidate is string => !!candidate);
  const executablePath = chromiumExecutableCandidates.find((candidate) => existsSync(candidate));
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 345, height: 490 },
      deviceScaleFactor: 3,
    });
    const page = await context.newPage();
    const cardClassName = sanitizeClassName(preview.cardClassName);
    const contentClassName = sanitizeClassName(preview.contentClassName) || "preview-content-shell";
    const richTextClassName = sanitizeClassName(preview.richTextClassName) || "preview-richtext";
    const selectedCardStyle = sanitizeClassName(preview.selectedCardStyle).split(/\s+/)[0] || "";
    const cardStyle = sanitizeStyleObject(preview.cardStyle);
    const contentStyle = sanitizeStyleObject(preview.contentStyle);
    const pngs: Buffer[] = [];

    for (const pageHtml of pages) {
      await page.setContent(buildPreviewExportHtml({
        pageHtml,
        cardClassName,
        cardStyle,
        contentClassName,
        contentStyle,
        richTextClassName,
        selectedCardStyle,
      }), { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts?.ready);
      await page.evaluate(() => {
        const richText = document.querySelector<HTMLElement>(".preview-richtext");
        const shell = document.querySelector<HTMLElement>(".preview-content-shell");
        if (!richText || !shell) return;
        richText.style.transform = "";
        richText.style.width = "";
        const availableHeight = shell.clientHeight - 8;
        const availableWidth = shell.clientWidth;
        const scrollHeight = richText.scrollHeight;
        if (availableHeight <= 0 || scrollHeight <= availableHeight) return;
        const scale = Math.max(0.72, Math.min(1, availableHeight / scrollHeight));
        richText.style.transform = `scale(${scale})`;
        richText.style.width = `${availableWidth / scale}px`;
      });
      pngs.push(Buffer.from(await page.screenshot({
        type: "png",
        clip: { x: 0, y: 0, width: 345, height: 490 },
        omitBackground: false,
      })));
    }
    await context.close();
    return pngs;
  } finally {
    await browser.close();
  }
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
  const renderId = randomUUID();
  const shouldPersist = body?.persist === true;
  const requirePreview = body?.requirePreview === true;
  const hasPreview = hasPreviewPayload(body?.preview);

  if (!hasPreview && !requirePreview) {
    try {
      const data = await renderXhsCardLayout({
        userId,
        accessToken: token,
        body: {
          ...body,
          markdown,
        },
      });
      return NextResponse.json({ data });
    } catch (error) {
      console.error("[xhs-layout/render] service render failed", error);
      return NextResponse.json({ error: "模板渲染失败，请稍后重试" }, { status: 500 });
    }
  }

  try {
    const pngs = hasPreview
      ? await renderPreviewPagesToPngs(body?.preview as NonNullable<RenderRequestBody["preview"]>)
      : [];
    if (requirePreview && pngs.length === 0) {
      return NextResponse.json({ error: "预览截图渲染失败，请重试" }, { status: 500 });
    }
    if (pngs.length === 0) {
      const svgs = buildRenderSvgs({
        markdown,
        templateId,
        title: renderTitle,
        includeCover,
        maxPages,
        cover: body?.cover,
      });

      if (svgs.length === 0) {
        return NextResponse.json({ error: "模板渲染失败，请稍后重试" }, { status: 500 });
      }

      for (const svg of svgs) {
        pngs.push(await svgToPngBuffer(svg));
      }
    }

    const folder = `xhs-layout/${userId}/${renderId}`;
    const bucket = getAssetBucket();
    const uploadedUrls: string[] = [];

    for (let i = 0; i < pngs.length; i += 1) {
      const path = `${folder}/page-${String(i + 1).padStart(2, "0")}.png`;
      const uploadResult = await uploadToStorage({
        bucket,
        path,
        body: pngs[i],
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

    if (shouldPersist) {
      await prisma.$transaction(async (tx) => {
        await tx.creativeTask.create({
          data: {
            id: renderId,
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
          where: { taskType_taskId: { taskType: "poster", taskId: renderId } },
          create: {
            userId,
            taskType: "poster",
            taskId: renderId,
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
    }

    return NextResponse.json({
      data: {
        taskId: shouldPersist ? renderId : "",
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
