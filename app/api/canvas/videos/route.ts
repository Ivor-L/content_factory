import { NextRequest, NextResponse } from "next/server";
import { getApiKeyForUser, getRequestUserContext } from "@/lib/authServer";
import {
  CanvasCreditsError,
  ensureCanvasCreditsAvailable,
  resolveCanvasCreditsApiKey,
} from "@/lib/canvasCredits";

/**
 * POST /api/canvas/videos
 * Trigger video generation via the same n8n webhook as storyboard.
 *
 * Flow:
 *  1. Pre-check credits balance (ensureCanvasCreditsAvailable → preparedCharge)
 *  2. POST to n8n with { segment_id, prompt, image_url, model, … }
 *     + context: { creditsApiKey, charge } so the callback can deduct
 *  3. Return { task_id } immediately
 *  4. n8n calls back /api/canvas/videos/webhook — webhook deducts credits on success
 */
export async function POST(request: NextRequest) {
  const { userId, apiKey } = await getRequestUserContext(request, {
    allowDefaultApiKey: true,
    useSystemApiKey: true,
  });
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const requestBody = body as Record<string, unknown>;

  const creditsApiKey =
    (await getApiKeyForUser(userId)) || resolveCanvasCreditsApiKey(apiKey ?? null);
  if (!creditsApiKey) {
    return NextResponse.json(
      {
        error: {
          code: "CANVAS_CREDITS_NOT_CONFIGURED",
          message: "积分服务未配置，请联系管理员。",
        },
      },
      { status: 500 },
    );
  }

  // 1. Pre-check balance; get the charge object for later deduction
  let preparedCharge;
  try {
    preparedCharge = await ensureCanvasCreditsAvailable(creditsApiKey, "video", requestBody);
  } catch (error) {
    if (error instanceof CanvasCreditsError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    throw error;
  }

  // 2. Use node_id as task_id so the Supabase Realtime subscription matches
  const nodeId = String(requestBody.node_id || "").trim();
  const taskId = nodeId || crypto.randomUUID().replace(/-/g, "");

  const webhookUrl =
    process.env.N8N_VIDEO_GEN_WEBHOOK?.trim() ||
    "https://hooks.atomx.top/webhook/storyboard_video";

  const callbackBase = (
    process.env.N8N_CALLBACK_BASE_URL ||
    process.env.CANVAS_VIDEO_POLL_CALLBACK_BASE_URL ||
    "https://atomx.top"
  ).replace(/\/+$/, "");
  const callbackUrl = `${callbackBase}/api/canvas/videos/webhook`;

  const n8nPayload = {
    // Identifies this job in both n8n and the callback
    segment_id: taskId,
    task_id: taskId,
    // Video params
    prompt: requestBody.prompt,
    image_url: requestBody.image_url || requestBody.first_frame_image || null,
    model: requestBody.model,
    aspect_ratio: requestBody.aspect_ratio || requestBody.ratio || "16:9",
    duration: requestBody.duration || 8,
    // Infra
    callback_url: callbackUrl,
    api_key: creditsApiKey,
    admin_token: process.env.ADMIN_TOKEN,
    // Credits context — n8n must echo this object back in the callback payload
    context: {
      creditsApiKey,
      charge: preparedCharge,
    },
  };

  console.log("[canvas/videos] Triggering n8n:", { taskId, model: requestBody.model });

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(n8nPayload),
    });
    if (!res.ok) {
      throw new Error(`n8n webhook returned ${res.status}`);
    }
  } catch (error) {
    console.error("[canvas/videos] n8n error:", error);
    return NextResponse.json(
      {
        error: {
          code: "CANVAS_VIDEO_PROXY_FAILED",
          message: error instanceof Error ? error.message : "触发视频生成失败",
        },
      },
      { status: 502 },
    );
  }

  // 3. Return task_id so the frontend can subscribe via Supabase Realtime
  return NextResponse.json({ task_id: taskId });
}
