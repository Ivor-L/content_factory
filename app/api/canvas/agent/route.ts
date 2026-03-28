import { NextRequest, NextResponse } from "next/server";
import { getRequestUserContext } from "@/lib/authServer";
import {
  buildCanvasUpstreamHeaders,
  resolveCanvasUpstreamApiKey,
  resolveCanvasUpstreamEndpoint,
} from "@/lib/canvasUpstream";

export type CanvasIntent =
  | "image"
  | "video"
  | "digital_human"
  | "text"
  | "mixed";

export type CanvasAgentResult = {
  intent: CanvasIntent;
  prompt: string;
  ratio?: "16:9" | "9:16" | "1:1" | "4:3";
};

const SYSTEM_PROMPT = `你是一个画布意图分析助手。分析用户的输入，判断他们想在无限画布上创建什么。
返回严格的 JSON 格式（不加 markdown 代码块）：
{"intent":"...","prompt":"...","ratio":"..."}

intent 规则（只能选其一）：
- "image"：提到图片、生图、图像、海报、封面、banner、图、照片、插画
- "video"：提到视频、短片、广告片、动画、clip、短视频
- "digital_human"：提到数字人、虚拟人、avatar、口播、AI主播
- "text"：只需要文案、脚本、标题、copy、文字内容
- "mixed"：无法判断或多类型混合，直接创作

ratio 规则（可选，无法判断就不返回）：
- "9:16"：竖屏、手机、短视频、小红书、TikTok
- "16:9"：横屏、宽屏、电脑端
- "1:1"：方形、正方形
- "4:3"：4比3

prompt 规则：
- 提取用户真正想创作的核心描述，去掉"帮我"、"请"等指令词
- 保留所有关键细节、风格、场景描述
- 语言与用户保持一致`;

export async function POST(request: NextRequest) {
  const { userId, apiKey } = await getRequestUserContext(request, {
    allowDefaultApiKey: true,
    useSystemApiKey: true,
  });
  const upstreamApiKey = resolveCanvasUpstreamApiKey(apiKey);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "Missing message" }, { status: 400 });
  }

  // Fallback: keyword-based classification when LLM is unavailable
  const fallback = classifyByKeyword(message);

  if (!upstreamApiKey) {
    return NextResponse.json(fallback);
  }

  const endpoint = resolveCanvasUpstreamEndpoint("chat");
  if (!endpoint) {
    return NextResponse.json(fallback);
  }

  try {
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: buildCanvasUpstreamHeaders({ userId, apiKey: upstreamApiKey }),
      body: JSON.stringify({
        model: "gpt-4o-mini",
        stream: false,
        temperature: 0,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: message },
        ],
      }),
      cache: "no-store",
    });

    if (!upstream.ok) {
      return NextResponse.json(fallback);
    }

    const data = await upstream.json().catch(() => null);
    const content = data?.choices?.[0]?.message?.content?.trim() ?? "";
    if (!content) return NextResponse.json(fallback);

    const parsed = JSON.parse(content) as Partial<CanvasAgentResult>;
    const validIntents: CanvasIntent[] = ["image", "video", "digital_human", "text", "mixed"];
    const intent: CanvasIntent = validIntents.includes(parsed.intent as CanvasIntent)
      ? (parsed.intent as CanvasIntent)
      : fallback.intent;
    const result: CanvasAgentResult = {
      intent,
      prompt: typeof parsed.prompt === "string" && parsed.prompt.trim() ? parsed.prompt.trim() : message,
      ...(parsed.ratio ? { ratio: parsed.ratio } : {}),
    };
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(fallback);
  }
}

function classifyByKeyword(message: string): CanvasAgentResult {
  const lower = message.toLowerCase();
  let intent: CanvasIntent = "mixed";
  let ratio: CanvasAgentResult["ratio"] | undefined;

  if (/图片|生图|图像|海报|封面|banner|插画|照片|配图/.test(lower)) intent = "image";
  else if (/视频|短片|广告片|动画|短视频|clip/.test(lower)) intent = "video";
  else if (/数字人|虚拟人|avatar|口播|ai主播/.test(lower)) intent = "digital_human";
  else if (/文案|脚本|标题|copy|文字|文本/.test(lower)) intent = "text";

  if (/竖屏|9:16|手机|小红书|tiktok|抖音/.test(lower)) ratio = "9:16";
  else if (/横屏|16:9|宽屏/.test(lower)) ratio = "16:9";
  else if (/方形|1:1|正方形/.test(lower)) ratio = "1:1";

  return { intent, prompt: message, ...(ratio ? { ratio } : {}) };
}
