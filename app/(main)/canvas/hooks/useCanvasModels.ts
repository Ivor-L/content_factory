"use client";

import { useMemo } from "react";

type ModelOption = {
  id: string;
  label: string;
  provider: string;
  description?: string;
};

const TEXT_MODELS: ModelOption[] = [
  { id: "gpt-4o-mini", label: "GPT-4o Mini", provider: "openai" },
  { id: "gpt-5.2", label: "GPT-5.2", provider: "openai" },
  { id: "deepseek-chat", label: "DeepSeek Chat", provider: "deepseek" },
];

const IMAGE_MODELS: ModelOption[] = [
  { id: "doubao-seedream-4-5", label: "豆包 Seedream 4.5", provider: "chatfire" },
  { id: "nano-banana-pro", label: "Nano Banana Pro", provider: "chatfire" },
  { id: "gemini-3-pro-image", label: "Gemini 3 Pro Image", provider: "google" },
];

const VIDEO_MODELS: ModelOption[] = [
  { id: "sora-2-all", label: "Sora 2 全能", provider: "nextide" },
  { id: "veo-3.1-fast", label: "Veo 3.1 Fast", provider: "nextide" },
  { id: "grok-video-3-10s", label: "Grok Video 3 · 10s", provider: "nextide" },
];

export function useCanvasModels() {
  const defaults = useMemo(
    () => ({
      text: TEXT_MODELS[0],
      image: IMAGE_MODELS[0],
      video: VIDEO_MODELS[0],
    }),
    [],
  );

  return useMemo(
    () => ({
      textModels: TEXT_MODELS,
      imageModels: IMAGE_MODELS,
      videoModels: VIDEO_MODELS,
      defaultModels: defaults,
    }),
    [defaults],
  );
}
