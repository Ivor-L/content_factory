import { NextRequest, NextResponse } from "next/server";
import { getApiKeyForUser, getRequestUserContext } from "@/lib/authServer";
import {
  CanvasCreditsError,
  deductCanvasCredits,
  resolveCanvasCreditsApiKey,
} from "@/lib/canvasCredits";
import { getCreditCostForModel } from "@/lib/creditCosts";

const ALLOWED_MODELS = new Set([
  "gemini-3.1-flash-lite-preview",
  "gemini-2.5-pro",
]);

function getBaseUrl() {
  const base = process.env.CANVAS_API_BASE_URL || process.env.CLOUD_API_BASE_URL || "";
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

function getSystemApiKey() {
  return (
    process.env.CANVAS_UPSTREAM_DEFAULT_API_KEY ||
    process.env.CLOUD_API_KEY ||
    ""
  );
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await getRequestUserContext(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { instruction, upstreamText, imageUrl, model: rawModel } = body as Record<string, unknown>;

    if (!instruction || typeof instruction !== "string" || !instruction.trim()) {
      return NextResponse.json({ error: "Missing instruction" }, { status: 400 });
    }

    const model =
      typeof rawModel === "string" && ALLOWED_MODELS.has(rawModel)
        ? rawModel
        : "gemini-3.1-flash-lite-preview";

    const userApiKey = await getApiKeyForUser(userId);
    const creditsApiKey = resolveCanvasCreditsApiKey(userApiKey);
    if (!creditsApiKey) {
      return NextResponse.json({ error: "积分服务未配置，请联系管理员" }, { status: 400 });
    }

    try {
      const amount = await getCreditCostForModel("canvas_text_transform", model, 1);
      await deductCanvasCredits(creditsApiKey, "image", { model }, {
        charge: {
          workflowId: model,
          workflowName: model,
          amount,
          reason: "canvas_text_transform",
        },
      });
    } catch (error) {
      if (error instanceof CanvasCreditsError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: error.status },
        );
      }
      throw error;
    }

    const baseUrl = getBaseUrl();
    const apiKey = getSystemApiKey();
    if (!baseUrl || !apiKey) {
      return NextResponse.json({ error: "LLM 服务未配置" }, { status: 500 });
    }

    // Build message content
    type ContentPart =
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } };
    const contentParts: ContentPart[] = [];

    // If imageUrl provided, attach image
    if (typeof imageUrl === "string" && imageUrl.trim()) {
      let imageDataUrl = imageUrl.trim();
      if (!imageDataUrl.startsWith("data:")) {
        const imgRes = await fetch(imageDataUrl, { cache: "no-store" });
        if (imgRes.ok) {
          const contentType = imgRes.headers.get("content-type") || "image/jpeg";
          const mimeType = contentType.split(";")[0].trim();
          const buffer = await imgRes.arrayBuffer();
          const base64 = Buffer.from(buffer).toString("base64");
          imageDataUrl = `data:${mimeType};base64,${base64}`;
        }
      }
      contentParts.push({ type: "image_url", image_url: { url: imageDataUrl } });
    }

    // Build text prompt with upstream context
    const contextBlock =
      typeof upstreamText === "string" && upstreamText.trim()
        ? `以下是上游节点的内容，请根据它来执行指令：\n\n${upstreamText.trim()}\n\n`
        : "";
    contentParts.push({ type: "text", text: `${contextBlock}指令：${instruction.trim()}` });

    const chatUrl = `${baseUrl}/chat/completions`;
    const llmResponse = await fetch(chatUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: contentParts }],
        temperature: 0.5,
      }),
    });

    if (!llmResponse.ok) {
      console.error("[canvas/text-transform] LLM error:", llmResponse.status);
      return NextResponse.json({ error: "AI 处理失败，请稍后重试" }, { status: 502 });
    }

    const payload = await llmResponse.json();
    const text: string =
      payload?.choices?.[0]?.message?.content ||
      (payload?.candidates?.[0]?.content?.parts as Array<{ text?: string }>)
        ?.map((p) => p.text || "")
        .join("") ||
      "";

    if (!text) {
      return NextResponse.json({ error: "未获取到处理结果" }, { status: 502 });
    }

    return NextResponse.json({ result: text });
  } catch (error) {
    console.error("[canvas/text-transform] error", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
