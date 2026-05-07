import { existsSync } from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { getRequestUserContext } from "@/lib/authServer";

type ExportFormat = "png" | "jpeg";

type ExportRequestBody = {
  pages?: unknown;
  format?: unknown;
  width?: unknown;
  height?: unknown;
};

export const runtime = "nodejs";

const MAX_EXPORT_PAGES = 24;
const MAX_PAGE_HTML_LENGTH = 320000;
const DEFAULT_WIDTH = 900;
const DEFAULT_HEIGHT = 1200;

function normalizeFormat(value: unknown): ExportFormat {
  return value === "jpeg" ? "jpeg" : "png";
}

function normalizeDimension(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.round(value), 320), 2400);
}

function sanitizePageHtml(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?<\/object>/gi, "")
    .slice(0, MAX_PAGE_HTML_LENGTH);
}

function getChromiumExecutablePath(): string | undefined {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    process.env.CHROMIUM_EXECUTABLE_PATH,
    process.platform === "linux" ? "/usr/bin/chromium-browser" : undefined,
    process.platform === "linux" ? "/usr/bin/chromium" : undefined,
  ].filter((candidate): candidate is string => !!candidate);
  return candidates.find((candidate) => existsSync(candidate));
}

export async function POST(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as ExportRequestBody | null;
  const pages = Array.isArray(body?.pages)
    ? body.pages.map(sanitizePageHtml).filter(Boolean).slice(0, MAX_EXPORT_PAGES)
    : [];
  if (pages.length === 0) {
    return NextResponse.json({ error: "pages 不能为空" }, { status: 400 });
  }

  const format = normalizeFormat(body?.format);
  const width = normalizeDimension(body?.width, DEFAULT_WIDTH);
  const height = normalizeDimension(body?.height, DEFAULT_HEIGHT);

  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({
      headless: true,
      executablePath: getChromiumExecutablePath(),
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    try {
      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 1,
      });
      await context.route("**/*", (route) => {
        const url = route.request().url();
        if (url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("about:")) {
          void route.continue();
          return;
        }
        void route.abort();
      });

      const page = await context.newPage();
      const images: string[] = [];

      for (const html of pages) {
        await page.setContent(html, { waitUntil: "load" });
        await page.evaluate(() => document.fonts?.ready);
        const buffer = await page.screenshot({
          type: format,
          quality: format === "jpeg" ? 94 : undefined,
          clip: { x: 0, y: 0, width, height },
          omitBackground: false,
        });
        images.push(Buffer.from(buffer).toString("base64"));
      }

      await context.close();

      return NextResponse.json({
        data: {
          format,
          mime: format === "jpeg" ? "image/jpeg" : "image/png",
          images,
        },
      });
    } finally {
      await browser.close();
    }
  } catch (error) {
    console.error("[xhs-layout/md2card-export] failed", error);
    return NextResponse.json({ error: "图片导出失败，请稍后重试" }, { status: 500 });
  }
}
