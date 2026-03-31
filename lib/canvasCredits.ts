import { deductCredits } from "@/lib/credits";

type CanvasCreditKind = "image" | "video" | "grid" | "grid-split" | "image-understanding";

type CanvasCreditDefaults = {
  workflowIdEnv: string;
  workflowNameEnv: string;
  amountEnv: string;
  defaultWorkflowId: string;
  defaultWorkflowName: string;
  defaultAmount: number;
  reason: string;
};

type WorkflowCreditMeta = {
  workflowId?: string;
  workflowName?: string;
  amount?: number;
};

type ModelWorkflowPreset = {
  aliases: string[];
  workflowId: string;
  workflowName: string;
};

export type CanvasCreditCharge = {
  workflowId: string;
  workflowName: string;
  amount: number;
  reason: string;
};

const DEFAULT_POINTS_API_BASE = "https://api.atomx.top";

const POINTS_API_BASES = Array.from(
  new Set(
    [process.env.POINTS_API_BASE, DEFAULT_POINTS_API_BASE]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim().replace(/\/$/, "")),
  ),
);

const CANVAS_CREDIT_DEFAULTS: Record<CanvasCreditKind, CanvasCreditDefaults> = {
  image: {
    workflowIdEnv: "CANVAS_IMAGE_WORKFLOW_ID",
    workflowNameEnv: "CANVAS_IMAGE_WORKFLOW_NAME",
    amountEnv: "CANVAS_IMAGE_CREDIT_COST",
    defaultWorkflowId: "flow_image_video_Veo",
    defaultWorkflowName: "Canvas Image Generation",
    defaultAmount: 1,
    reason: "canvas_image_generation",
  },
  video: {
    workflowIdEnv: "CANVAS_VIDEO_WORKFLOW_ID",
    workflowNameEnv: "CANVAS_VIDEO_WORKFLOW_NAME",
    amountEnv: "CANVAS_VIDEO_CREDIT_COST",
    defaultWorkflowId: "flow_video_Veo",
    defaultWorkflowName: "Canvas Video Generation",
    defaultAmount: 1,
    reason: "canvas_video_generation",
  },
  grid: {
    workflowIdEnv: "CANVAS_GRID_WORKFLOW_ID",
    workflowNameEnv: "CANVAS_GRID_WORKFLOW_NAME",
    amountEnv: "CANVAS_GRID_CREDIT_COST",
    defaultWorkflowId: "flow_grid",
    defaultWorkflowName: "Canvas Grid Generation",
    defaultAmount: 50,
    reason: "canvas_grid_generation",
  },
  "image-understanding": {
    workflowIdEnv: "CANVAS_IMAGE_UNDERSTANDING_WORKFLOW_ID",
    workflowNameEnv: "CANVAS_IMAGE_UNDERSTANDING_WORKFLOW_NAME",
    amountEnv: "CANVAS_IMAGE_UNDERSTANDING_CREDIT_COST",
    defaultWorkflowId: "flow_image_understanding",
    defaultWorkflowName: "Canvas Image Understanding",
    defaultAmount: 15,
    reason: "canvas_image_understanding",
  },
  "grid-split": {
    workflowIdEnv: "CANVAS_GRID_SPLIT_WORKFLOW_ID",
    workflowNameEnv: "CANVAS_GRID_SPLIT_WORKFLOW_NAME",
    amountEnv: "CANVAS_GRID_SPLIT_CREDIT_COST",
    defaultWorkflowId: "flow_grid_split",
    defaultWorkflowName: "Canvas Grid Split",
    defaultAmount: 100,
    reason: "canvas_grid_split",
  },
};

const MODEL_WORKFLOW_PRESETS: Record<CanvasCreditKind, ModelWorkflowPreset[]> = {
  image: [
    {
      aliases: ["nano banana pro", "nanobananapro", "nano-banana-pro", "gemini-3-pro-image-preview", "gemini-3.1-pro-preview"],
      workflowId: "flow_nano_pro",
      workflowName: "Nano Banana Pro",
    },
    {
      aliases: ["nano banana2", "nano banana 2", "nanobanana2", "nano-banana-2"],
      workflowId: "flow0015",
      workflowName: "Nano Banana2",
    },
    {
      aliases: ["nano banana", "nanobanana", "nano-banana", "gemini-3.1-flash-image-preview", "gemini-3.1-flash-lite-preview"],
      workflowId: "flow_nano",
      workflowName: "NanoBanana",
    },
  ],
  video: [
    {
      aliases: ["veo3.1", "veo31", "veo 3.1", "veo_3_1_fast", "veo3.1_fast", "veo_3_1-fast", "veo_3_1", "veo3", "veo3-fast"],
      workflowId: "jbp_video_Veo3.1_fast",
      workflowName: "Veo3.1 Fast",
    },
    {
      aliases: ["sora2", "sora 2", "sora-2", "sora-2-all"],
      workflowId: "flow_farm_copy",
      workflowName: "Sora2",
    },
    {
      aliases: ["grok3", "grok 3", "grok-3", "grok-video-3-10s", "grok-video-3", "grokvideo3"],
      workflowId: "flow0020",
      workflowName: "Grok3",
    },
  ],
};

type BalanceCheckAttempt = {
  ok: boolean;
  sufficient?: boolean | null;
  status: number;
  base: string;
  message?: string;
};

function readEnv(name: string): string {
  return String(process.env[name] || "").trim();
}

function parsePositiveNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

export function resolveCanvasCreditsApiKey(candidate?: string | null) {
  const normalizedCandidate = typeof candidate === "string" ? candidate.trim() : "";
  if (normalizedCandidate) {
    return normalizedCandidate;
  }
  const fallbacks = [
    process.env.CANVAS_CREDITS_DEFAULT_API_KEY,
    process.env.DEFAULT_USER_API_KEY,
    process.env.CLOUD_API_KEY,
  ];
  for (const item of fallbacks) {
    if (typeof item === "string" && item.trim()) {
      return item.trim();
    }
  }
  return null;
}

function normalizeModelToken(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_.:-]+/g, "");
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function resolveModelName(requestBody: Record<string, unknown>): string | null {
  const direct = pickString(requestBody, [
    "model",
    "model_name",
    "modelName",
    "image_model",
    "imageModel",
    "video_model",
    "videoModel",
  ]);
  if (direct) return direct;

  const nestedCandidates = ["data", "payload", "input"];
  for (const key of nestedCandidates) {
    const nested = requestBody[key];
    if (!nested || typeof nested !== "object") continue;
    const fromNested = pickString(nested as Record<string, unknown>, [
      "model",
      "model_name",
      "modelName",
      "image_model",
      "imageModel",
      "video_model",
      "videoModel",
    ]);
    if (fromNested) return fromNested;
  }

  return null;
}

function resolveWorkflowByModel(
  kind: CanvasCreditKind,
  requestBody: Record<string, unknown>,
): { workflowId?: string; workflowName?: string } {
  const modelName = resolveModelName(requestBody);
  if (!modelName) return {};

  const normalized = normalizeModelToken(modelName);
  const presets = MODEL_WORKFLOW_PRESETS[kind];
  for (const preset of presets) {
    const matched = preset.aliases.some((alias) => normalizeModelToken(alias) === normalized);
    if (matched) {
      return {
        workflowId: preset.workflowId,
        workflowName: preset.workflowName,
      };
    }
  }
  return {};
}

function parseWorkflowMetaPayload(payload: unknown): WorkflowCreditMeta {
  if (!payload || typeof payload !== "object") return {};
  const record = payload as Record<string, unknown>;
  const nested =
    record.data && typeof record.data === "object"
      ? (record.data as Record<string, unknown>)
      : null;

  const source = nested ?? record;
  const workflowIdRaw = source.workflow_id ?? source.workflowId;
  const workflowNameRaw = source.workflow_name ?? source.workflowName;
  const amountRaw = source.credit_cost ?? source.creditCost;

  const workflowId =
    workflowIdRaw !== undefined && workflowIdRaw !== null ? String(workflowIdRaw).trim() : undefined;
  const workflowName =
    workflowNameRaw !== undefined && workflowNameRaw !== null
      ? String(workflowNameRaw).trim()
      : undefined;
  const amount = parsePositiveNumber(amountRaw) ?? undefined;

  return {
    workflowId: workflowId || undefined,
    workflowName: workflowName || undefined,
    amount,
  };
}

async function fetchWorkflowCreditMeta(workflowId: string): Promise<WorkflowCreditMeta> {
  for (const base of POINTS_API_BASES) {
    try {
      const url = `${base}/workflow-credits/query?workflow_id=${encodeURIComponent(workflowId)}`;
      const response = await fetch(url, { method: "GET", cache: "no-store" });
      if (!response.ok) continue;
      const parsed = await response.json().catch(() => null);
      const meta = parseWorkflowMetaPayload(parsed);
      if (meta.workflowId || meta.workflowName || meta.amount) {
        return meta;
      }
    } catch {
      // Ignore workflow meta lookup failure and fallback to defaults below.
    }
  }
  return {};
}

async function resolveCanvasCreditCharge(
  kind: CanvasCreditKind,
  requestBody: Record<string, unknown>,
): Promise<CanvasCreditCharge> {
  const defaults = CANVAS_CREDIT_DEFAULTS[kind];
  const modelWorkflow = resolveWorkflowByModel(kind, requestBody);
  const requestWorkflowId = pickString(requestBody, ["workflow_id", "workflowId"]);
  const requestWorkflowName = pickString(requestBody, ["workflow_name", "workflowName"]);

  const workflowId =
    requestWorkflowId ||
    modelWorkflow.workflowId ||
    readEnv(defaults.workflowIdEnv) ||
    defaults.defaultWorkflowId;
  const workflowName =
    requestWorkflowName ||
    modelWorkflow.workflowName ||
    readEnv(defaults.workflowNameEnv) ||
    defaults.defaultWorkflowName;

  const envAmount = parsePositiveNumber(readEnv(defaults.amountEnv));
  const fallbackAmount = envAmount ?? defaults.defaultAmount;

  const workflowMeta = await fetchWorkflowCreditMeta(workflowId);
  const amount = workflowMeta.amount ?? fallbackAmount;

  return {
    workflowId: workflowMeta.workflowId || workflowId,
    workflowName: workflowMeta.workflowName || workflowName,
    amount,
    reason: defaults.reason,
  };
}

function parseBooleanFlag(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value !== 0 : null;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "ok", "sufficient"].includes(normalized)) return true;
    if (["false", "0", "no", "insufficient"].includes(normalized)) return false;
  }
  return null;
}

function extractSufficientFlag(payload: Record<string, unknown> | null): boolean | null {
  if (!payload) return null;
  const candidates = [
    payload.data && typeof payload.data === "object" ? (payload.data as Record<string, unknown>).sufficient : undefined,
    payload.sufficient,
    (payload.result && typeof payload.result === "object"
      ? (payload.result as Record<string, unknown>).sufficient
      : undefined),
    payload.data && typeof payload.data === "object"
      ? (payload.data as Record<string, unknown>).result &&
        typeof (payload.data as Record<string, unknown>).result === "object"
        ? ((payload.data as Record<string, unknown>).result as Record<string, unknown>).sufficient
        : undefined
      : undefined,
  ];

  for (const candidate of candidates) {
    const parsed = parseBooleanFlag(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }
  return null;
}

function looksLikeHtmlResponse(res: Response, bodyText: string) {
  const ct = res.headers.get("content-type") || "";
  return ct.includes("text/html") || bodyText.trimStart().startsWith("<!DOCTYPE html");
}

async function callBalanceCheckEndpoint({
  base,
  payloadKey,
  apiKey,
  requiredAmount,
}: {
  base: string;
  payloadKey: "api_key" | "apiKey";
  apiKey: string;
  requiredAmount: number;
}): Promise<BalanceCheckAttempt | null> {
  const normalizedAmount = Math.max(0, Math.ceil(requiredAmount));

  const performRequest = async (method: "GET" | "POST") => {
    try {
      let response: Response;
      if (method === "GET") {
        const url = new URL("/api/balance/check", base);
        url.searchParams.set(payloadKey, apiKey);
        url.searchParams.set("required", String(normalizedAmount));
        url.searchParams.set("amount", String(normalizedAmount));
        response = await fetch(url.toString(), { method, cache: "no-store" });
      } else {
        const body: Record<string, unknown> = {
          [payloadKey]: apiKey,
          required: normalizedAmount,
          amount: normalizedAmount,
        };
        response = await fetch(new URL("/api/balance/check", base).toString(), {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          cache: "no-store",
        });
      }

      if (method === "GET" && response.status === 405) {
        return performRequest("POST");
      }

      const text = await response.text();
      if (looksLikeHtmlResponse(response, text)) {
        return {
          ok: false,
          status: response.status,
          base,
          message: "Received HTML instead of JSON",
        };
      }

      let parsed: Record<string, unknown> | null = null;
      try {
        parsed = text ? (JSON.parse(text) as Record<string, unknown>) : null;
      } catch {
        parsed = null;
      }

      if (!response.ok || (parsed && parseBooleanFlag(parsed.ok) === false)) {
        const message =
          (parsed?.message as string) ||
          (parsed?.error as string) ||
          text.slice(0, 300) ||
          "Balance check failed";
        return {
          ok: false,
          status: response.status,
          base,
          message,
        };
      }

      const sufficient = extractSufficientFlag(parsed);
      return {
        ok: true,
        status: response.status,
        base,
        sufficient,
        message: typeof parsed?.message === "string" ? parsed.message : undefined,
      };
    } catch (error) {
      return {
        ok: false,
        status: 500,
        base,
        message: error instanceof Error ? error.message : "Unknown balance check error",
      };
    }
  };

  return performRequest("GET");
}

async function assertCreditsBalance(apiKey: string, requiredAmount: number) {
  const normalizedAmount = Math.max(1, Math.ceil(requiredAmount));
  let lastError: BalanceCheckAttempt | null = null;

  for (const base of POINTS_API_BASES) {
    for (const payloadKey of ["api_key", "apiKey"] as const) {
      const result = await callBalanceCheckEndpoint({
        base,
        payloadKey,
        apiKey,
        requiredAmount: normalizedAmount,
      });
      if (!result) continue;

      if (result.ok) {
        if (result.sufficient === false) {
          throw new CanvasCreditsError(
            result.message || "积分不足，请充值后再尝试生成。",
            402,
            "CANVAS_CREDITS_INSUFFICIENT",
          );
        }
        return;
      }

      lastError = result;

      if (result.status === 401 || result.status === 403) {
        throw new CanvasCreditsError(
          "积分服务凭据不可用，请联系管理员处理。",
          400,
          "CANVAS_CREDITS_API_KEY_INVALID",
        );
      }

      if (result.message && /insufficient|余额不足|积分不足/i.test(result.message)) {
        throw new CanvasCreditsError(
          "积分不足，请充值后再尝试生成。",
          402,
          "CANVAS_CREDITS_INSUFFICIENT",
        );
      }
    }
  }

  throw new CanvasCreditsError(
    lastError?.message || "积分服务暂时不可用，请稍后重试。",
    lastError?.status && lastError.status < 500 ? lastError.status : 502,
    "CANVAS_CREDITS_SERVICE_UNAVAILABLE",
  );
}

function extractErrorMessage(raw: string): string {
  const parts = raw.split(":");
  const detail = parts.length > 1 ? parts.slice(1).join(":").trim() : raw.trim();
  if (!detail) return "积分扣除失败，请稍后重试。";

  try {
    const parsed = JSON.parse(detail) as Record<string, unknown>;
    const nestedError =
      parsed.error && typeof parsed.error === "object"
        ? (parsed.error as Record<string, unknown>)
        : null;

    const candidates = [
      parsed.message,
      parsed.msg,
      parsed.error,
      nestedError?.message,
      nestedError?.msg,
      nestedError?.error,
      parsed.detail,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }
  } catch {
    // The detail is plain text and not JSON.
  }

  return detail;
}

function parseStatusFromDeductError(raw: string): number {
  const match = raw.match(/\((\d+)\s*@/);
  if (!match) return 500;
  const status = Number(match[1]);
  return Number.isFinite(status) ? status : 500;
}

function normalizeDeductError(error: unknown): { status: number; code: string; message: string } {
  const raw = error instanceof Error ? error.message : String(error || "Failed to deduct credits");
  const lowerRaw = raw.toLowerCase();
  const status = parseStatusFromDeductError(raw);
  const detailMessage = extractErrorMessage(raw);
  const lowerDetail = detailMessage.toLowerCase();

  if (
    lowerRaw.includes("insufficient") ||
    lowerRaw.includes("余额不足") ||
    lowerRaw.includes("积分不足") ||
    lowerDetail.includes("insufficient") ||
    lowerDetail.includes("余额不足") ||
    lowerDetail.includes("积分不足")
  ) {
    return {
      status: 402,
      code: "CANVAS_CREDITS_INSUFFICIENT",
      message: "积分不足，请充值后再尝试生成。",
    };
  }

  if (status === 401 || status === 403) {
    return {
      status: 400,
      code: "CANVAS_CREDITS_API_KEY_INVALID",
      message: "积分服务凭据不可用，请联系管理员处理。",
    };
  }

  if (status >= 500) {
    return {
      status: 502,
      code: "CANVAS_CREDITS_SERVICE_UNAVAILABLE",
      message: "积分服务暂时不可用，请稍后重试。",
    };
  }

  return {
    status: 400,
    code: "CANVAS_CREDITS_DEDUCT_FAILED",
    message: detailMessage || "积分扣除失败，请稍后重试。",
  };
}

export class CanvasCreditsError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function ensureCanvasCreditsAvailable(
  apiKey: string,
  kind: CanvasCreditKind,
  requestBody: Record<string, unknown>,
): Promise<CanvasCreditCharge> {
  const charge = await resolveCanvasCreditCharge(kind, requestBody);

  // Allow bypassing the external balance check via env var
  if (readEnv("CANVAS_SKIP_CREDITS_CHECK") === "true") {
    return charge;
  }

  if (!apiKey) {
    throw new CanvasCreditsError("画布积分服务未配置，请联系管理员处理。", 400, "CANVAS_API_KEY_REQUIRED");
  }
  await assertCreditsBalance(apiKey, charge.amount);
  return charge;
}

export async function deductCanvasCredits(
  apiKey: string,
  kind: CanvasCreditKind,
  requestBody: Record<string, unknown>,
  options: { charge?: CanvasCreditCharge } = {},
) {
  if (!apiKey) {
    throw new CanvasCreditsError("画布积分服务未配置，请联系管理员处理。", 400, "CANVAS_API_KEY_REQUIRED");
  }

  const charge = options.charge ?? (await resolveCanvasCreditCharge(kind, requestBody));

  try {
    await deductCredits(apiKey, {
      amount: charge.amount,
      workflowId: charge.workflowId,
      workflowName: charge.workflowName,
      reason: charge.reason,
    });
  } catch (error) {
    const normalized = normalizeDeductError(error);
    throw new CanvasCreditsError(normalized.message, normalized.status, normalized.code);
  }
}
