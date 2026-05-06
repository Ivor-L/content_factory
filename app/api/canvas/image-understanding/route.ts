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

    const { imageUrl, prompt, model: rawModel } = body as Record<string, unknown>;

    if (!imageUrl || typeof imageUrl !== "string") {
      return NextResponse.json({ error: "Missing imageUrl" }, { status: 400 });
    }
    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    const model =
      typeof rawModel === "string" && ALLOWED_MODELS.has(rawModel)
        ? rawModel
        : "gemini-3.1-flash-lite-preview";

    // Resolve user API key for credits
    const userApiKey = await getApiKeyForUser(userId);
    const creditsApiKey = resolveCanvasCreditsApiKey(userApiKey);

    if (!creditsApiKey) {
      return NextResponse.json({ error: "积分服务未配置，请联系管理员" }, { status: 400 });
    }

    // Deduct credits (same logic as image/video generation)
    try {
      const amount = await getCreditCostForModel("canvas_image_understanding", model, 15);
      await deductCanvasCredits(creditsApiKey, "image", { model }, {
        charge: {
          workflowId: model,
          workflowName: model,
          amount,
          reason: "canvas_image_understanding",
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

    // Download image and convert to base64 data URL
    let imageDataUrl: string;
    if (imageUrl.startsWith("data:")) {
      imageDataUrl = imageUrl;
    } else {
      const imgRes = await fetch(imageUrl, { cache: "no-store" });
      if (!imgRes.ok) {
        return NextResponse.json({ error: "图片下载失败，请检查图片链接是否有效" }, { status: 400 });
      }
      const contentType = imgRes.headers.get("content-type") || "image/jpeg";
      const mimeType = contentType.split(";")[0].trim();
      const buffer = await imgRes.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      imageDataUrl = `data:${mimeType};base64,${base64}`;
    }

    // Call LLM via OpenAI-compatible chat completions endpoint
    const baseUrl = getBaseUrl();
    const apiKey = getSystemApiKey();
    if (!baseUrl || !apiKey) {
      return NextResponse.json({ error: "LLM 服务未配置" }, { status: 500 });
    }

    const chatUrl = `${baseUrl}/chat/completions`;
    const llmResponse = await fetch(chatUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: imageDataUrl } },
              { type: "text", text: prompt },
            ],
          },
        ],
        temperature: 0.3,
      }),
    });

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text().catch(() => "");
      console.error("[canvas/image-understanding] LLM error:", llmResponse.status, errorText);
      return NextResponse.json({ error: "图片理解失败，请稍后重试" }, { status: 502 });
    }

    const payload = await llmResponse.json();
    // Support both OpenAI choices format and Gemini candidates format
    const text: string =
      payload?.choices?.[0]?.message?.content ||
      (payload?.candidates?.[0]?.content?.parts as Array<{ text?: string }>)
        ?.map((p) => p.text || "")
        .join("") ||
      "";

    if (!text) {
      return NextResponse.json({ error: "未获取到分析结果" }, { status: 502 });
    }

    return NextResponse.json({ result: text });
  } catch (error) {
    console.error("[canvas/image-understanding] error", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
