export type AssistantProviderId = "codex" | "claude-code" | "minimax" | "canvas";

export interface AssistantProviderOption {
  id: AssistantProviderId;
  label: string;
  description: string;
}

export const ASSISTANT_PROVIDER_OPTIONS: AssistantProviderOption[] = [
  {
    id: "codex",
    label: "Codex",
    description: "GPT-5/Codex 系列",
  },
  {
    id: "claude-code",
    label: "Claude Code",
    description: "Claude / Sonnet / Opus / Haiku",
  },
  {
    id: "minimax",
    label: "MiniMax",
    description: "MiniMax / Hailuo 系列",
  },
  {
    id: "canvas",
    label: "Canvas",
    description: "现有画布对话上游",
  },
];

const PROVIDER_ID_ALIASES: Record<string, AssistantProviderId> = {
  codex: "codex",
  "openai-codex": "codex",
  "gpt-5": "codex",
  claude: "claude-code",
  anthropic: "claude-code",
  "claude-code": "claude-code",
  minimax: "minimax",
  hailuo: "minimax",
  canvas: "canvas",
};

function normalizeToken(input?: string | null) {
  return (input || "").trim().toLowerCase();
}

export function parseAssistantProviderId(input?: string | null): AssistantProviderId | null {
  const token = normalizeToken(input);
  if (!token) return null;
  if (PROVIDER_ID_ALIASES[token]) return PROVIDER_ID_ALIASES[token];
  if (token.includes("codex") || token.includes("gpt-5")) return "codex";
  if (
    token.includes("claude") ||
    token.includes("anthropic") ||
    token.includes("sonnet") ||
    token.includes("opus") ||
    token.includes("haiku")
  ) {
    return "claude-code";
  }
  if (token.includes("minimax") || token.includes("hailuo") || token.includes("abab")) {
    return "minimax";
  }
  if (token.includes("canvas") || token.includes("cloud")) return "canvas";
  return null;
}

export function normalizeAssistantProviderId(input?: string | null): AssistantProviderId {
  return parseAssistantProviderId(input) || "codex";
}

export function inferAssistantProviderFromModel(
  modelId?: string | null,
  providerHint?: string | null,
): AssistantProviderId {
  const hint = normalizeToken(providerHint);
  if (hint) {
    return normalizeAssistantProviderId(hint);
  }

  const model = normalizeToken(modelId);
  if (!model) return "codex";

  if (
    model.includes("codex") ||
    model.includes("gpt-5") ||
    model.startsWith("o3") ||
    model.startsWith("o4")
  ) {
    return "codex";
  }

  if (
    model.includes("claude") ||
    model.includes("sonnet") ||
    model.includes("opus") ||
    model.includes("haiku")
  ) {
    return "claude-code";
  }

  if (model.includes("minimax") || model.includes("hailuo") || model.includes("abab")) {
    return "minimax";
  }

  return "codex";
}

export function providerUsesNexApiProxy(providerId: AssistantProviderId) {
  return providerId === "codex" || providerId === "claude-code" || providerId === "minimax";
}
