import { NextRequest, NextResponse } from "next/server";
import { getRequestUserContext } from "@/lib/authServer";

type PublishRequestBody = {
  type?: string;
  title?: string;
  content?: string;
  images?: string[];
  video?: string;
  cover?: string;
};

type UpstreamResponse = {
  success?: boolean;
  data?: {
    id?: string;
    url?: string;
    qrcode?: string;
  };
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
};

const REDNOTE_BASE_URL = "https://www.myaibot.vip";
const REDNOTE_PUBLISH_ENDPOINT = "/api/rednote/publish";
const REDNOTE_API_KEY = (process.env.REDNOTE_API_KEY || "").trim();

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

export async function POST(request: NextRequest) {
  const { userId } = await getRequestUserContext(request, { allowDefaultApiKey: false, useSystemApiKey: false });
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!REDNOTE_API_KEY) {
    return NextResponse.json({ error: "REDNOTE_API_KEY 未配置" }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as PublishRequestBody | null;
  const type = body?.type === "video" ? "video" : "normal";
  const title = sanitizeTitle(body?.title);
  const content = sanitizeText(body?.content, 1000);
  const images = normalizeImageUrls(body?.images);
  const video = sanitizeText(body?.video, 2000);
  const cover = sanitizeText(body?.cover, 2000);

  if (type === "normal" && images.length === 0) {
    return NextResponse.json({ error: "图文发布至少需要 1 张图片" }, { status: 400 });
  }

  if (type === "video" && !video) {
    return NextResponse.json({ error: "视频发布必须提供 video URL" }, { status: 400 });
  }

  const upstreamPayload =
    type === "video"
      ? {
          api_key: REDNOTE_API_KEY,
          type,
          title,
          content,
          video,
          cover: cover || undefined,
        }
      : {
          api_key: REDNOTE_API_KEY,
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
    const success = payload?.success === true;
    const data = payload?.data;
    const errorMessage = payload?.error?.message?.trim();

    if (!upstreamResponse.ok || !success || !data?.qrcode) {
      const status = upstreamResponse.status || 502;
      const fallback =
        errorMessage ||
        (upstreamResponse.status === 401
          ? "发布服务鉴权失败，请检查 API Key"
          : upstreamResponse.status === 402
            ? "发布服务调用次数不足"
            : "发布失败，请稍后重试");
      return NextResponse.json({ error: fallback, code: payload?.error?.code || "UPSTREAM_ERROR" }, { status });
    }

    return NextResponse.json({
      data: {
        id: data.id || "",
        url: data.url || "",
        qrcode: data.qrcode || "",
      },
    });
  } catch (error) {
    console.error("[xhs-layout/publish] failed", error);
    return NextResponse.json({ error: "发布服务请求失败，请稍后重试" }, { status: 502 });
  }
}
