type Role = "system" | "user" | "assistant";

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: string } };

type ApiStyle = "openai" | "yunwu";

type YunwuPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

type YunwuContent = {
  role: string;
  parts: YunwuPart[];
};

export type CloudMessage = {
  role: Role;
  content: string | ContentPart[];
};

export interface CloudAttachment {
  mimeType: string;
  data: string; // base64 string
  alt?: string;
}

export interface CloudChatParams {
  model: string;
  system?: string;
  user?: string;
  messages?: CloudMessage[];
  attachments?: CloudAttachment[];
  temperature?: number;
  maxOutputTokens?: number;
  responseFormat?: "text" | "json_object";
  responseMimeType?: string;
  metadata?: Record<string, unknown>;
}

export interface CloudChatResponse<T = string> {
  text: string;
  data?: T;
  raw: any;
}

function getBaseUrl() {
  const base = process.env.CLOUD_API_BASE_URL;
  if (!base) {
    throw new Error("CLOUD_API_BASE_URL is not configured");
  }
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

function getApiKey() {
  const key = process.env.CLOUD_API_KEY;
  if (!key) {
    throw new Error("CLOUD_API_KEY is not configured");
  }
  return key;
}

function normalizeBaseUrl(base: string) {
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

function detectApiStyle(baseUrl: string): ApiStyle {
  const override = (process.env.CLOUD_API_STYLE || "").toLowerCase();
  if (override === "openai" || override === "yunwu") {
    return override as ApiStyle;
  }

  const lower = baseUrl.toLowerCase();
  if (
    lower.includes("yunwu") ||
    lower.includes("v1beta") ||
    lower.includes("generatecontent")
  ) {
    return "yunwu";
  }
  if (
    lower.includes("openai") ||
    lower.includes("kie.ai") ||
    lower.endsWith("/v1") ||
    lower.includes("/chat/completions")
  ) {
    return "openai";
  }
  return "yunwu";
}

function toDataUrl(attachment: CloudAttachment) {
  const prefix = `data:${attachment.mimeType || "application/octet-stream"};base64,`;
  return prefix + attachment.data;
}

function buildMessages(params: CloudChatParams): CloudMessage[] {
  if (params.messages?.length) {
    return params.messages;
  }

  const contentParts: ContentPart[] = [];
  if (params.user) {
    contentParts.push({ type: "text", text: params.user });
  }
  if (params.attachments?.length) {
    for (const attachment of params.attachments) {
      contentParts.push({
        type: "image_url",
        image_url: {
          url: toDataUrl(attachment),
          ...(attachment.alt ? { detail: attachment.alt } : {}),
        },
      });
    }
  }

  const messages: CloudMessage[] = [];
  if (params.system) {
    messages.push({ role: "system", content: params.system });
  }
  if (contentParts.length > 0) {
    messages.push({ role: "user", content: contentParts });
  }

  return messages;
}

function stripDataPrefix(data: string) {
  return data.replace(/^data:.*;base64,/, "").trim();
}

function normalizeYunwuRole(role: Role) {
  if (role === "assistant") return "model";
  return role;
}

function partsFromContent(content: string | ContentPart[]): YunwuPart[] {
  if (typeof content === "string") {
    return content ? [{ text: content }] : [];
  }
  const parts: YunwuPart[] = [];
  for (const part of content) {
    if (part.type === "text" && part.text) {
      parts.push({ text: part.text });
      continue;
    }
    if (part.type === "image_url" && part.image_url?.url) {
      const url = part.image_url.url;
      if (url.startsWith("data:")) {
        const [meta, payload] = url.split(",", 2);
        const mime = meta.split(";")[0].replace(/^data:/, "") || "image/png";
        parts.push({ inlineData: { mimeType: mime, data: payload ?? "" } });
      } else {
        parts.push({ text: `Image reference: ${url}` });
      }
    }
  }
  return parts;
}

function buildYunwuContents(params: CloudChatParams): {
  contents: YunwuContent[];
  systemInstruction?: string;
} {
  const contents: YunwuContent[] = [];
  let systemInstruction = params.system?.trim();

  if (params.messages?.length) {
    for (const message of params.messages) {
      if (message.role === "system") {
        const msgText =
          typeof message.content === "string"
            ? message.content
            : message.content
                .filter((part) => part.type === "text")
                .map((part) => part.text)
                .join("\n");
        systemInstruction = [systemInstruction, msgText].filter(Boolean).join("\n\n");
        continue;
      }

      const parts = partsFromContent(message.content);
      if (parts.length === 0) continue;
      contents.push({
        role: normalizeYunwuRole(message.role),
        parts,
      });
    }
  }

  if (!params.messages?.length) {
    const parts: YunwuPart[] = [];
    if (params.user) {
      parts.push({ text: params.user });
    }
    if (params.attachments?.length) {
      for (const attachment of params.attachments) {
        parts.push({
          inlineData: {
            mimeType: attachment.mimeType || "application/octet-stream",
            data: stripDataPrefix(attachment.data),
          },
        });
      }
    }
    if (parts.length) {
      contents.push({ role: "user", parts });
    }
  }

  if (!contents.length) {
    throw new Error("Yunwu API requires user content or messages.");
  }

  return { contents, systemInstruction };
}

function extractTextFromResponse(payload: any): string {
  if (!payload) {
    return "";
  }

  const yunwuCandidates = payload?.candidates;
  if (Array.isArray(yunwuCandidates) && yunwuCandidates.length) {
    for (const candidate of yunwuCandidates) {
      const parts = candidate?.content?.parts;
      if (!Array.isArray(parts)) continue;
      const collected = parts
        .map((part: any) => part?.text || part?.output_text)
        .filter((text: any) => typeof text === "string" && text.trim().length);
      if (collected.length) {
        return collected.join("\n").trim();
      }
    }
  }

  if (payload.output && Array.isArray(payload.output)) {
    for (const outputBlock of payload.output) {
      const content = outputBlock?.content;
      if (Array.isArray(content)) {
        for (const part of content) {
          if (part?.type === "output_text" && typeof part.text === "string") {
            return part.text;
          }
          if (part?.type === "text" && typeof part.text === "string") {
            return part.text;
          }
        }
      }
    }
  }
  if (Array.isArray(payload.choices)) {
    const choice = payload.choices[0];
    const content = choice?.message?.content;
    if (typeof content === "string") {
      return content;
    }
    if (Array.isArray(content)) {
      for (const part of content) {
        if (typeof part?.text === "string") {
          return part.text;
        }
        if (part?.type === "text" && typeof part.text === "string") {
          return part.text;
        }
      }
    }
  }
  if (typeof payload.text === "string") {
    return payload.text;
  }
  return "";
}

function parseJsonLoose<T>(text: string): T {
  const attempts: string[] = [];
  const trimmed = text.trim();
  if (trimmed) attempts.push(trimmed);
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) {
    attempts.push(fenceMatch[1].trim());
  }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    attempts.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      continue;
    }
  }
  throw new Error("Failed to parse JSON from cloud response");
}

async function callOpenAiChat<T>(
  baseUrl: string,
  apiKey: string,
  params: CloudChatParams
): Promise<CloudChatResponse<T>> {
  const url = normalizeBaseUrl(baseUrl).endsWith("/chat/completions")
    ? normalizeBaseUrl(baseUrl)
    : `${normalizeBaseUrl(baseUrl)}/chat/completions`;

  const body: Record<string, unknown> = {
    model: params.model,
    messages: buildMessages(params),
    temperature: params.temperature ?? 0.2,
  };

  if (params.maxOutputTokens) {
    body.max_tokens = params.maxOutputTokens;
  }
  if (params.responseFormat === "json_object") {
    body.response_format = { type: "json_object" };
  }
  if (params.metadata) {
    body.metadata = params.metadata;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Cloud LLM request failed: ${response.status} ${response.statusText} ${errorText}`
    );
  }

  const payload = await response.json();
  const text = extractTextFromResponse(payload);
  const result: CloudChatResponse<T> = { text, raw: payload };
  if (params.responseFormat === "json_object" && text) {
    result.data = parseJsonLoose<T>(text);
  }
  return result;
}

function buildYunwuUrl(baseUrl: string, model: string) {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!model && !normalized.includes("/models/")) {
    throw new Error("model is required for Yunwu API calls");
  }

  if (/\/models\//.test(normalized)) {
    return normalized.endsWith(":generateContent")
      ? normalized
      : `${normalized}:generateContent`;
  }

  const cleanModel = encodeURIComponent(
    model.replace(/^models\//i, "").replace(/:generatecontent$/i, "")
  );
  return `${normalized}/models/${cleanModel}:generateContent`;
}

async function callYunwuChat<T>(
  baseUrl: string,
  apiKey: string,
  params: CloudChatParams
): Promise<CloudChatResponse<T>> {
  const url = buildYunwuUrl(baseUrl, params.model);
  const { contents, systemInstruction } = buildYunwuContents(params);

  const wantsJson = params.responseFormat === "json_object";
  const generationConfig: Record<string, unknown> = {
    temperature: params.temperature ?? 0.2,
  };
  if (params.maxOutputTokens) {
    generationConfig.maxOutputTokens = params.maxOutputTokens;
  }
  const responseMimeType = params.responseMimeType || (wantsJson ? "application/json" : undefined);
  if (responseMimeType) {
    generationConfig.responseMimeType = responseMimeType;
  }

  const body: Record<string, unknown> = {
    contents,
    generationConfig,
  };

  if (systemInstruction) {
    body.systemInstruction = {
      parts: [{ text: systemInstruction }],
    };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Cloud LLM request failed: ${response.status} ${response.statusText} ${errorText}`
    );
  }

  const payload = await response.json();
  const text = extractTextFromResponse(payload);
  const result: CloudChatResponse<T> = { text, raw: payload };
  if (wantsJson && text) {
    result.data = parseJsonLoose<T>(text);
  }
  return result;
}

export async function callCloudChat<T = string>(
  params: CloudChatParams
): Promise<CloudChatResponse<T>> {
  const baseUrl = getBaseUrl();
  const apiKey = getApiKey();
  const style = detectApiStyle(baseUrl);

  if (style === "openai") {
    return callOpenAiChat(baseUrl, apiKey, params);
  }
  return callYunwuChat(baseUrl, apiKey, params);
}

export async function callCloudJson<T>(
  params: CloudChatParams
): Promise<CloudChatResponse<T>> {
  return callCloudChat<T>({
    ...params,
    responseFormat: "json_object",
  });
}
