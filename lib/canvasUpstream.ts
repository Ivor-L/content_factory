import { NextResponse } from "next/server";

type CanvasEndpointKind = "chat" | "image" | "video" | "videoTask";

const DEFAULT_PATHS: Record<CanvasEndpointKind, string> = {
  chat: "/chat/completions",
  image: "/images/generations",
  video: "/video/create",
  videoTask: "/video/query?id={taskId}",
};

const SPECIFIC_URL_ENV: Record<CanvasEndpointKind, string> = {
  chat: "CANVAS_CHAT_COMPLETIONS_URL",
  image: "CANVAS_IMAGE_GENERATIONS_URL",
  video: "CANVAS_VIDEO_GENERATIONS_URL",
  videoTask: "CANVAS_VIDEO_TASK_URL_TEMPLATE",
};

const PATH_ENV: Record<CanvasEndpointKind, string> = {
  chat: "CANVAS_CHAT_COMPLETIONS_PATH",
  image: "CANVAS_IMAGE_GENERATIONS_PATH",
  video: "CANVAS_VIDEO_GENERATIONS_PATH",
  videoTask: "CANVAS_VIDEO_TASK_PATH",
};

function normalizeUrlPart(input: string) {
  return input.replace(/\/+$/, "");
}

function joinBaseAndPath(baseUrl: string, path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${normalizeUrlPart(baseUrl)}/${path.replace(/^\/+/, "")}`;
}

function readEnv(name: string) {
  return (process.env[name] || "").trim();
}

function resolveCanvasBaseUrl() {
  return readEnv("CANVAS_API_BASE_URL") || readEnv("CLOUD_API_BASE_URL");
}

export function resolveCanvasUpstreamEndpoint(
  kind: CanvasEndpointKind,
  taskId?: string,
) {
  const specificEnv = SPECIFIC_URL_ENV[kind];
  const specificUrl = readEnv(specificEnv);

  let endpoint = "";
  if (specificUrl) {
    endpoint = specificUrl;
  } else {
    const baseUrl = resolveCanvasBaseUrl();
    if (!baseUrl) {
      return null;
    }
    const path = readEnv(PATH_ENV[kind]) || DEFAULT_PATHS[kind];
    endpoint = joinBaseAndPath(baseUrl, path);
  }

  if (kind === "videoTask") {
    if (!taskId) return null;
    if (endpoint.includes("{taskId}")) {
      endpoint = endpoint.replace("{taskId}", encodeURIComponent(taskId));
    } else {
      endpoint = `${normalizeUrlPart(endpoint)}/${encodeURIComponent(taskId)}`;
    }
  }

  return endpoint;
}

export function buildCanvasUpstreamHeaders({
  userId,
  apiKey,
}: {
  userId: string;
  apiKey?: string | null;
}) {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  headers.set("x-user-id", userId);
  headers.set("x-canvas-user-id", userId);

  const staticBearer = readEnv("CANVAS_UPSTREAM_BEARER_TOKEN");
  if (staticBearer) {
    headers.set("Authorization", `Bearer ${staticBearer}`);
  } else if (apiKey) {
    headers.set("Authorization", `Bearer ${apiKey}`);
    headers.set("x-user-api-key", apiKey);
  }

  const adminToken = readEnv("CANVAS_UPSTREAM_ADMIN_TOKEN");
  if (adminToken) {
    headers.set("x-admin-token", adminToken);
  }

  return headers;
}

export function resolveCanvasUpstreamApiKey(fallbackApiKey?: string | null) {
  if (fallbackApiKey?.trim()) {
    return fallbackApiKey.trim();
  }
  const defaultKey = resolveDefaultCanvasApiKey();
  return defaultKey || null;
}

export function canvasMissingEndpointResponse(kind: CanvasEndpointKind) {
  const messageByKind: Record<CanvasEndpointKind, string> = {
    chat: "缺少画布对话接口",
    image: "缺少画布生图接口",
    video: "缺少画布生视频任务创建接口",
    videoTask: "缺少画布视频任务查询接口",
  };

  return NextResponse.json(
    {
      error: {
        code: "CANVAS_UPSTREAM_NOT_CONFIGURED",
        message: messageByKind[kind],
        required_interfaces: [
          "POST /chat/completions",
          "POST /images/generations",
          "POST /video/create",
          "GET /video/query?id={taskId}",
        ],
        required_env: [
          "CANVAS_API_BASE_URL",
          "CLOUD_API_BASE_URL",
          "CANVAS_CHAT_COMPLETIONS_URL",
          "CANVAS_IMAGE_GENERATIONS_URL",
          "CANVAS_VIDEO_GENERATIONS_URL",
          "CANVAS_VIDEO_TASK_URL_TEMPLATE",
        ],
      },
    },
    { status: 501 },
  );
}

export async function relayUpstreamResponse(upstream: Response) {
  const contentType = upstream.headers.get("content-type") || "application/json";
  const bodyText = await upstream.text();

  if (contentType.includes("application/json")) {
    try {
      return NextResponse.json(
        bodyText ? JSON.parse(bodyText) : {},
        { status: upstream.status },
      );
    } catch {
      return new NextResponse(bodyText, {
        status: upstream.status,
        headers: { "Content-Type": contentType },
      });
    }
  }

  return new NextResponse(bodyText, {
    status: upstream.status,
    headers: { "Content-Type": contentType },
  });
}

function resolveDefaultCanvasApiKey() {
  const candidates = [
    readEnv("CANVAS_UPSTREAM_DEFAULT_API_KEY"),
    readEnv("CANVAS_CREDITS_DEFAULT_API_KEY"),
    readEnv("DEFAULT_USER_API_KEY"),
    readEnv("CLOUD_API_KEY"),
  ];
  for (const candidate of candidates) {
    if (candidate) {
      return candidate;
    }
  }
  return null;
}
