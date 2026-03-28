"use client";

import { useMemo } from "react";

export type ModelOption = {
  id: string;
  label: string;
  provider: string;
  description?: string;
  estimatedTime?: string;
  isNew?: boolean;
};

// Per-model supported parameter sets (used by UI to show/hide controls)
export type ImageModelParams = {
  ratios: string[];       // empty → hide ratio selector
  qualities: string[];    // empty → hide quality selector
};
export type VideoModelParams = {
  /** "orientation" = portrait/landscape; "aspect_ratio" = 16:9/9:16/1:1; "none" = hidden */
  orientationType: "orientation" | "aspect_ratio" | "none";
  orientationOptions: string[];
  /** "size" = small/large; "resolution" = 720p/1080p; "none" = hidden */
  sizeType: "size" | "resolution" | "none";
  sizeOptions: string[];
  durations: string[];    // displayed durations; for sora these are integers as strings "10"/"15"
  durationSuffix: string; // "s" for display
};

export const IMAGE_MODEL_PARAMS: Record<string, ImageModelParams> = {
  "doubao-seedream-4-5-251128": {
    ratios: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "21:9"],
    qualities: ["2K", "4K"],
  },
  "nano-banana": {
    ratios: [],   // no size param
    qualities: [],
  },
  "gemini-3.1-pro-preview": {
    ratios: [],
    qualities: [],
  },
  "grok-3-image": {
    // pixel sizes mapped to labels
    ratios: ["960x960", "1280x720", "720x1280", "1168x784", "784x1168"],
    qualities: [],
  },
};

export const VIDEO_MODEL_PARAMS: Record<string, VideoModelParams> = {
  "sora-2-all": {
    orientationType: "orientation",
    orientationOptions: ["landscape", "portrait"],
    sizeType: "size",
    sizeOptions: ["small", "large"],
    durations: ["10", "15"],
    durationSuffix: "s",
  },
  "veo_3_1-fast": {
    orientationType: "aspect_ratio",
    orientationOptions: ["16:9", "9:16", "1:1"],
    sizeType: "resolution",
    sizeOptions: ["720p", "1080p"],
    durations: ["8"],
    durationSuffix: "s",
  },
  "grok-video-3": {
    orientationType: "aspect_ratio",
    orientationOptions: ["1:1", "2:3", "3:2"],
    sizeType: "none",
    sizeOptions: [],
    durations: [],
    durationSuffix: "s",
  },
};

const TEXT_MODELS: ModelOption[] = [
  { id: "gpt-4o-mini", label: "GPT-4o Mini", provider: "openai" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro（视觉）", provider: "google", description: "支持图片/视频理解" },
  { id: "grok-3", label: "Grok 3", provider: "xai" },
  { id: "deepseek-chat", label: "DeepSeek Chat", provider: "deepseek" },
];

const IMAGE_MODELS: ModelOption[] = [
  { id: "doubao-seedream-4-5-251128", label: "豆包 Seedream 4.5", provider: "bytedance", estimatedTime: "2min" },
  { id: "gemini-3.1-pro-preview", label: "Nano Banana Pro", provider: "google", description: "gemini-3.1-pro-preview", estimatedTime: "1min", isNew: true },
  { id: "nano-banana", label: "Nano Banana 2", provider: "fal", description: "fal.ai 文生图", estimatedTime: "1min", isNew: true },
  { id: "grok-3-image", label: "Grok 3 Image", provider: "xai", estimatedTime: "30s" },
];

const VIDEO_MODELS: ModelOption[] = [
  { id: "sora-2-all", label: "Sora 2 全能", provider: "openai", estimatedTime: "2min" },
  { id: "veo_3_1-fast", label: "Veo 3.1 Fast", provider: "google", estimatedTime: "30s", isNew: true },
  { id: "grok-video-3", label: "Grok Video 3", provider: "xai", estimatedTime: "1min" },
];

const DIGITAL_HUMAN_MODELS: ModelOption[] = [
  { id: "omni-human-1.5", label: "OmniHuman 1.5", provider: "bytedance", estimatedTime: "2min" },
  { id: "hedra-character-3", label: "Hedra Character 3", provider: "hedra", estimatedTime: "1min" },
  { id: "hailuo-live-portrait", label: "Hailuo LivePortrait", provider: "minimax", estimatedTime: "1min" },
];

const AUDIO_MODELS: ModelOption[] = [
  { id: "nextide", label: "NexTide 数字人", provider: "nextide", description: "AI语音克隆与合成", estimatedTime: "15s" },
  { id: "suno_music", label: "Suno 音乐生成", provider: "suno", description: "AI作词作曲，生成完整歌曲", estimatedTime: "1min", isNew: true },
  { id: "suno_lyrics", label: "Suno 歌词生成", provider: "suno", description: "根据主题生成歌词文本", estimatedTime: "30s", isNew: true },
];

export function useCanvasModels() {
  const defaults = useMemo(
    () => ({
      text: TEXT_MODELS[0],
      image: IMAGE_MODELS.find((m) => m.id === "nano-banana") ?? IMAGE_MODELS[0],
      video: VIDEO_MODELS.find((m) => m.id === "veo_3_1-fast") ?? VIDEO_MODELS[0],
      digitalHuman: DIGITAL_HUMAN_MODELS[0],
      audio: AUDIO_MODELS[0],
    }),
    [],
  );

  return useMemo(
    () => ({
      textModels: TEXT_MODELS,
      imageModels: IMAGE_MODELS,
      videoModels: VIDEO_MODELS,
      digitalHumanModels: DIGITAL_HUMAN_MODELS,
      audioModels: AUDIO_MODELS,
      defaultModels: defaults,
    }),
    [defaults],
  );
}
