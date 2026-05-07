import { NextRequest, NextResponse } from "next/server";
import { getRequestUserContext } from "@/lib/authServer";
import prisma from "@/lib/prisma";

type PublishRequestBody = {
  type?: string;
  title?: string;
  content?: string;
  images?: string[];
  video?: string;
  cover?: string;
  taskId?: string;
};

type UpstreamResponse = {
  success?: boolean;
  ok?: boolean;
  data?: {
    id?: string;
    url?: string;
    qrcode?: string;
    qrCode?: string;
    qr_code?: string;
    qrcode_url?: string;
    qrcodeUrl?: string;
  };
  id?: string;
  url?: string;
  qrcode?: string;
  qrCode?: string;
  qr_code?: string;
  qrcode_url?: string;
  qrcodeUrl?: string;
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
};

const REDNOTE_BASE_URL = "https://www.myaibot.vip";
const REDNOTE_PUBLISH_ENDPOINT = "/api/rednote/publish";

function resolveRednoteApiKey() {
  return (
    process.env.REDNOTE_API_KEY
    || process.env.REDNOTE_QR_API_KEY
    || process.env.XHS_QR_PUBLISH_API_KEY
    || process.env.XHS_PUBLISH_API_KEY
    || ""
  ).trim();
}

function sanitizeText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n/g, "\n").trim().slice(0, maxLength);
}

function sanitizeTitle(value: unknown) {
  if (typeof value !== "string") return "";
  return Array.from(value.replace(/\r\n/g, " ").trim()).slice(0, 20).join("");
}

function normalizeImageUrls(images: unknown): string[] {
  if (!Array.isArray(images)) return [];
  return images
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 18);
}

function pickFirstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export async function POST(request: NextRequest) {
  const { userId } = await getRequestUserContext(request, { allowDefaultApiKey: false, useSystemApiKey: false });
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rednoteApiKey = resolveRednoteApiKey();
  if (!rednoteApiKey) {
    return NextResponse.json(
      {
        error:
          "小红书发布 API Key 未配置（请设置 REDNOTE_API_KEY / REDNOTE_QR_API_KEY / XHS_QR_PUBLISH_API_KEY）",
      },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => null)) as PublishRequestBody | null;
  const type = body?.type === "video" ? "video" : "normal";
  const title = sanitizeTitle(body?.title);
  const content = sanitizeText(body?.content, 1000);
  const images = normalizeImageUrls(body?.images);
  const video = sanitizeText(body?.video, 2000);
  const cover = sanitizeText(body?.cover, 2000);
  const taskId = sanitizeText(body?.taskId, 80);

  if (type === "normal" && images.length === 0) {
    return NextResponse.json({ error: "图文发布至少需要 1 张图片" }, { status: 400 });
  }

  if (type === "video" && !video) {
    return NextResponse.json({ error: "视频发布必须提供 video URL" }, { status: 400 });
  }

  const upstreamPayload =
    type === "video"
      ? {
          api_key: rednoteApiKey,
          type,
          title,
          content,
          video,
          cover: cover || undefined,
        }
      : {
          api_key: rednoteApiKey,
          type,
          title,
          content,
          images,
        };

  try {
    const upstreamResponse = await fetch(`${REDNOTE_BASE_URL}${REDNOTE_PUBLISH_ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(upstreamPayload),
      cache: "no-store",
    });

    const payload = (await upstreamResponse.json().catch(() => null)) as UpstreamResponse | null;
    const success = payload?.success === true || payload?.ok === true;
    const data = payload?.data;
    const errorMessage = payload?.error?.message?.trim();
    const qrcode = pickFirstString(
      data?.qrcode,
      data?.qrCode,
      data?.qr_code,
      data?.qrcode_url,
      data?.qrcodeUrl,
      payload?.qrcode,
      payload?.qrCode,
      payload?.qr_code,
      payload?.qrcode_url,
      payload?.qrcodeUrl,
    );
    const publishedUrl = pickFirstString(data?.url, payload?.url);
    const publishId = pickFirstString(data?.id, payload?.id);

    if (!upstreamResponse.ok || !success || !qrcode) {
      const status = upstreamResponse.status || 502;
      const fallback =
        errorMessage ||
        (upstreamResponse.status === 401
          ? "发布服务鉴权失败，请检查 API Key"
          : upstreamResponse.status === 402
            ? "发布服务调用次数不足"
            : "发布失败，请稍后重试");
      console.error("[xhs-layout/publish] upstream failed", {
        status: upstreamResponse.status,
        success,
        hasQrcode: Boolean(qrcode),
        payload,
      });
      return NextResponse.json({ error: fallback, code: payload?.error?.code || "UPSTREAM_ERROR" }, { status });
    }

    const resultPayload = {
      id: publishId,
      url: publishedUrl,
      qrcode,
    };

    if (taskId) {
      const existingSummary = await prisma.taskSummary.findFirst({
        where: {
          taskType: "poster",
          taskId,
          userId,
        },
        select: {
          metadata: true,
        },
      }).catch(() => null);

      const baseMetadata =
        existingSummary?.metadata &&
        typeof existingSummary.metadata === "object" &&
        !Array.isArray(existingSummary.metadata)
          ? (existingSummary.metadata as Record<string, unknown>)
          : {};

      await prisma.taskSummary.updateMany({
        where: {
          taskType: "poster",
          taskId,
          userId,
        },
        data: {
          metadata: {
            ...baseMetadata,
            posterMode:
              typeof baseMetadata.posterMode === "string"
                ? baseMetadata.posterMode
                : "text2image",
            source:
              typeof baseMetadata.source === "string"
                ? baseMetadata.source
                : "miniapp_xhs_layout",
            xhsPublish: {
              id: resultPayload.id,
              url: resultPayload.url,
              qrcode: resultPayload.qrcode,
              title,
            },
          },
          updatedAt: new Date(),
        },
      }).catch((error) => {
        console.error("[xhs-layout/publish] failed to update task summary metadata", error);
      });
    }

    return NextResponse.json({
      data: resultPayload,
    });
  } catch (error) {
    console.error("[xhs-layout/publish] failed", error);
    return NextResponse.json({ error: "发布服务请求失败，请稍后重试" }, { status: 502 });
  }
}
