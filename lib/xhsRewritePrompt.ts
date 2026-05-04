import { XHS_TITLE_FORMULA_PROMPT } from "@/lib/xhsTitleFormulaPrompt";

export const XHS_REWRITE_MODEL = "gemini-3.1-flash-lite-preview";
export const XHS_REWRITE_GEMINI_PATH = "/v1beta/models/gemini-3.1-flash-lite-preview:generateContent";

export type TitleFormulaCandidate = {
  title: string;
  formulaId: number;
  triggerType: string;
  formulaTemplate: string;
  originalExample: string;
  reason: string;
};

export type XhsRewriteMode = "rewrite" | "publishMeta";

export type XhsRewriteInput = {
  title: string;
  body: string;
  imageTexts?: string[];
  mode?: XhsRewriteMode;
  filePath?: string;
};

export type XhsRewriteResult = {
  title: string;
  body: string;
  imageTexts: string[];
  tags: string[];
  titleFormula: {
    topic: string;
    industry: string;
    candidates: TitleFormulaCandidate[];
    top3: TitleFormulaCandidate[];
  };
};

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function clipText(input: string, max = 120): string {
  if (input.length <= max) return input;
  return `${input.slice(0, max - 1)}...`;
}

function getBaseUrl() {
  const base = process.env.CANVAS_API_BASE_URL || process.env.CLOUD_API_BASE_URL || "";
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

function getSystemApiKey() {
  return process.env.CANVAS_UPSTREAM_DEFAULT_API_KEY || process.env.CLOUD_API_KEY || "";
}

function resolveGeminiGenerateContentUrl() {
  const explicit = normalizeText(process.env.XHS_REWRITE_GEMINI_ENDPOINT);
  if (explicit) return explicit;

  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    throw new Error("LLM 服务未配置");
  }

  if (/\/models\//i.test(baseUrl)) {
    return baseUrl.endsWith(":generateContent") ? baseUrl : `${baseUrl}:generateContent`;
  }

  const root = baseUrl.replace(/\/v1beta$/i, "").replace(/\/v1$/i, "");
  return `${root}${XHS_REWRITE_GEMINI_PATH}`;
}

function parseObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  if (!text) return null;
  try {
    return parseObject(JSON.parse(text));
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return parseObject(JSON.parse(text.slice(start, end + 1)));
    } catch {
      return null;
    }
  }
}

function extractTextFromGemini(payload: unknown): string {
  const source = parseObject(payload);
  const candidates = Array.isArray(source?.candidates) ? source.candidates : [];
  for (const candidate of candidates) {
    const candidateObj = parseObject(candidate);
    const contentObj = parseObject(candidateObj?.content);
    const parts = Array.isArray(contentObj?.parts) ? contentObj.parts : [];
    const text = parts
      .map((part) => normalizeText(parseObject(part)?.text))
      .filter(Boolean)
      .join("\n")
      .trim();
    if (text) return text;
  }
  return "";
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeText(item)).filter(Boolean);
}

function parseTitleFormulaCandidates(value: unknown): TitleFormulaCandidate[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const obj = parseObject(item);
      if (!obj) return null;
      const title = normalizeText(obj.title);
      const formulaId = Number(obj.formulaId);
      const triggerType = normalizeText(obj.triggerType);
      const formulaTemplate = normalizeText(obj.formulaTemplate);
      const originalExample = normalizeText(obj.originalExample);
      const reason = normalizeText(obj.reason);
      if (!title || !Number.isInteger(formulaId) || formulaId < 1 || formulaId > 75) return null;
      return {
        title,
        formulaId,
        triggerType,
        formulaTemplate,
        originalExample,
        reason,
      };
    })
    .filter((item): item is TitleFormulaCandidate => Boolean(item));
}

function buildXhsRewritePrompt(input: XhsRewriteInput) {
  const mode = input.mode || "rewrite";
  const bodyRequirement =
    mode === "publishMeta"
      ? "正文生成 120-320 字，口语化、有信息密度，必须是提炼总结而非复制原文。"
      : "正文结构更清晰，可读性更好，保留原意、事实信息和可复用表达。";
  const tagRequirement =
    mode === "publishMeta"
      ? "生成 4-8 个 tags，只写词本身，不要 #。"
      : "生成 3-6 个 tags，只写词本身，不要 #。";

  return [
    "你是一个小红书图文/视频笔记仿写助手。请在保留原意和事实信息的前提下，进行二创改写。",
    "",
    "标题必须严格使用下面的小红书标题公式工具规则：",
    XHS_TITLE_FORMULA_PROMPT,
    "",
    "改写要求：",
    "1. 标题必须从 75 个公式中匹配生成，不能自由发挥。",
    bodyRequirement,
    "3. 图片文案或视频字幕逐条改写，保持与原内容语义一致；没有图片文案时返回空数组。",
    "4. 如果是视频笔记或长正文，imageTexts 可以为空，但 body 必须基于原正文/视频文案仿写。",
    "5. 输出 JSON，不要输出任何额外说明。",
    "6. title 字段必须等于 top3[0].title。",
    `7. ${tagRequirement}`,
    "",
    "输出格式：",
    [
      "{",
      '  "topic": "提取的话题",',
      '  "industry": "提取的行业/领域",',
      '  "title": "Top 1 标题，必须等于 top3[0].title",',
      '  "titleCandidates": [',
      "    {",
      '      "title": "≤20字标题",',
      '      "formulaId": 7,',
      '      "triggerType": "好奇缺口",',
      '      "formulaTemplate": "[一群人] 不会告诉你的建议",',
      '      "originalExample": "会赚钱的博主不会告诉你的建议",',
      '      "reason": "一句话解释为什么适合"',
      "    }",
      "  ],",
      '  "top3": [',
      "    {",
      '      "title": "≤20字标题",',
      '      "formulaId": 7,',
      '      "triggerType": "好奇缺口",',
      '      "formulaTemplate": "[一群人] 不会告诉你的建议",',
      '      "originalExample": "会赚钱的博主不会告诉你的建议",',
      '      "reason": "一句话解释为什么最推荐"',
      "    }",
      "  ],",
      '  "body": "...",',
      '  "imageTexts": ["...", "..."],',
      '  "tags": ["标签1", "标签2"]',
      "}",
    ].join("\n"),
    "",
    input.filePath ? `文件名参考标题：${input.filePath}` : "",
    `原标题：${input.title || "未命名标题"}`,
    `原正文：${input.body || "暂无正文"}`,
    `原图片文案：${JSON.stringify(input.imageTexts || [])}`,
  ].filter(Boolean).join("\n");
}

export async function rewriteXhsNote(input: XhsRewriteInput): Promise<XhsRewriteResult> {
  const apiKey = getSystemApiKey();
  if (!apiKey) {
    throw new Error("LLM 服务未配置");
  }

  const prompt = buildXhsRewritePrompt(input);
  const response = await fetch(resolveGeminiGenerateContentUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: input.mode === "publishMeta" ? 0.35 : 0.7,
        maxOutputTokens: input.mode === "publishMeta" ? 1200 : 1800,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(errorText || `改写模型调用失败: ${response.status}`);
  }

  const payload = await response.json().catch(() => ({}));
  const raw = extractTextFromGemini(payload);
  const parsed = extractJsonObject(raw);
  if (!parsed) {
    throw new Error("改写模型未返回有效 JSON");
  }

  const candidates = parseTitleFormulaCandidates(parsed.titleCandidates);
  const top3Raw = parseTitleFormulaCandidates(parsed.top3);
  const top3 = top3Raw.length > 0 ? top3Raw.slice(0, 3) : candidates.slice(0, 3);
  const formulaTitle = normalizeText(top3[0]?.title || candidates[0]?.title);
  const title = formulaTitle || normalizeText(parsed.title) || clipText(input.title || "仿写标题", 60);
  const body = normalizeText(parsed.body) || input.body;
  const imageTexts = parseStringArray(parsed.imageTexts);
  const tags = parseStringArray(parsed.tags);

  return {
    title,
    body,
    imageTexts: imageTexts.length > 0 ? imageTexts : input.imageTexts || [],
    tags,
    titleFormula: {
      topic: normalizeText(parsed.topic),
      industry: normalizeText(parsed.industry),
      candidates,
      top3,
    },
  };
}

