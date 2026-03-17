import "@/lib/loadEnv";
import { Buffer } from "node:buffer";
import { Prisma } from "@prisma/client";
import type { HistoryDoc, StoryAsset, StylePreset } from "@prisma/client";

import prisma from "../lib/prisma";
import {
  assetJobNames,
  subscribeAssetJob,
  getBoss,
} from "../lib/queue";
import { callCloudJson } from "../lib/cloudLLM";
import { downloadFromStorage } from "../lib/storageDownload";
import { uploadToStorage } from "../lib/storageUpload";
import {
  getAssetBucket,
  historyInsightsPath,
  historyRuntimePath,
  storyStructurePath,
  styleAnalysisPath,
} from "../lib/storagePaths";
import {
  buildRuntimeBundleFromHistoryDoc,
  type RuntimeObjectBundle,
} from "../lib/creative/runtime/runtimeObjects";
import { toInputJson } from "../lib/jsonUtils";

type JsonValue = Prisma.JsonValue;

interface HistoryVoiceProfile {
  name: string;
  persona: string;
  toneDescriptors: string[];
  cadence: string;
  sentencePatterns: string[];
  hookAngles: string[];
  closingMoves: string[];
  signatureWords: string[];
}

interface HistoryAnalysis {
  summary: string;
  voice: HistoryVoiceProfile;
  dosAndDonts: {
    mustInclude: string[];
    avoid: string[];
  };
  structure: {
    sections: Array<{
      label: string;
      goal: string;
      summary: string;
      keywords: string[];
    }>;
  };
  reusableBlocks: {
    hooks: string[];
    transitions: string[];
    closers: string[];
    proofPoints: string[];
  };
  openingPatterns: Array<{
    label: string;
    usage: string;
    example: string;
  }>;
  transitionPlaybook: Array<{
    label: string;
    pattern: string;
    usage: string;
  }>;
  styleRulesDraft?: Record<string, any> | null;
}

interface StoryBlueprint {
  synopsis: string;
  protagonist: string;
  desire: string;
  conflict: string;
  resolution: string;
  beats: Array<{
    order: number;
    title: string;
    description: string;
    objective: string;
    channelIdeas: string[];
  }>;
  tags: string[];
  repurposeIdeas: string[];
}

interface StyleAnalysis {
  palette: Array<{ hex: string; usage: string }>;
  typography: {
    primary: string;
    secondary?: string;
    casing: string;
  };
  motifs: string[];
  layout: {
    density: "sparse" | "balanced" | "dense";
    composition: string;
    spacingNotes: string;
  };
  lighting: string;
  texture: string;
  promptKit: {
    positive: string[];
    negative: string[];
  };
}

const HISTORY_MODEL =
  process.env.CLOUD_HISTORY_MODEL ||
  process.env.CLOUD_DEFAULT_MODEL ||
  "gpt-4o-mini";
const STORY_MODEL =
  process.env.CLOUD_STORY_MODEL || process.env.CLOUD_DEFAULT_MODEL || "gpt-4o-mini";
const STYLE_MODEL =
  process.env.CLOUD_STYLE_MODEL || process.env.CLOUD_DEFAULT_MODEL || "gpt-4o-mini";

const HISTORY_MAX_TOKENS = numberFromEnv(
  process.env.ASSET_HISTORY_MAX_TOKENS,
  1400
);
const STORY_MAX_TOKENS = numberFromEnv(
  process.env.ASSET_STORY_MAX_TOKENS,
  1100
);
const STYLE_MAX_TOKENS = numberFromEnv(
  process.env.ASSET_STYLE_MAX_TOKENS,
  900
);

const HISTORY_CONCURRENCY = numberFromEnv(
  process.env.ASSET_HISTORY_CONCURRENCY,
  1
);
const STORY_CONCURRENCY = numberFromEnv(
  process.env.ASSET_STORY_CONCURRENCY,
  1
);
const STYLE_CONCURRENCY = numberFromEnv(
  process.env.ASSET_STYLE_CONCURRENCY,
  1
);

function numberFromEnv(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function jsonRecord(value: JsonValue | null | undefined) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return { ...(value as Record<string, any>) };
  }
  return {};
}

function mergeMeta(
  base: JsonValue | null | undefined,
  patch: Record<string, any>
) {
  return { ...jsonRecord(base), ...patch };
}

function mergedMetaInput(
  base: JsonValue | null | undefined,
  patch: Record<string, any>
) {
  return toInputJson(mergeMeta(base, patch)) ?? undefined;
}

function bufferToText(buffer: Buffer) {
  return buffer.toString("utf-8");
}

function truncateText(content: string, maxChars: number) {
  if (content.length <= maxChars) return content;
  return content.slice(0, maxChars);
}

function buildStyleVectorFromVoice(voice?: HistoryVoiceProfile | null) {
  const seedSource = [
    voice?.cadence ?? "",
    ...(voice?.toneDescriptors ?? []),
    ...(voice?.sentencePatterns ?? []),
  ]
    .filter(Boolean)
    .join("|");
  if (!seedSource) {
    return Array.from({ length: 16 }, (_, idx) => Number(((idx + 1) / 20).toFixed(3)));
  }
  const bytes = Buffer.from(seedSource);
  return Array.from({ length: 16 }, (_, idx) =>
    Number(((bytes[idx % bytes.length] % 100) / 100).toFixed(3)),
  );
}

async function uploadJsonArtifact(path: string, payload: unknown) {
  return uploadToStorage({
    bucket: getAssetBucket(),
    path,
    body: Buffer.from(JSON.stringify(payload, null, 2)),
    contentType: "application/json",
    upsert: true,
  });
}

async function handleHistoryDocJob({
  historyDocId,
}: {
  historyDocId: string;
}) {
  const doc = await prisma.historyDoc.findUnique({
    where: { id: historyDocId },
  });
  if (!doc) {
    console.warn(`[assets-worker] history doc ${historyDocId} not found`);
    return;
  }

  await prisma.historyDoc.update({
    where: { id: doc.id },
    data: {
      status: "PROCESSING",
      metadata: mergedMetaInput(doc.metadata, {
        processingStatus: "PROCESSING",
        workerStartedAt: nowIso(),
      }),
    },
  });

  try {
    const asset = await downloadFromStorage(doc.originalPath);
    const text = bufferToText(asset.buffer);
    if (!text.trim()) {
      throw new Error("历史文案为空，无法解析");
    }
    const excerpt = truncateText(text, 15000);
    const truncated = excerpt.length !== text.length;

    const analysis = await callCloudJson<HistoryAnalysis>({
      model: HISTORY_MODEL,
      system: HISTORY_SYSTEM_PROMPT,
      user: buildHistoryUserPrompt(doc, excerpt, truncated),
      maxOutputTokens: HISTORY_MAX_TOKENS,
      temperature: 0.2,
      metadata: { historyDocId: doc.id },
    });

    if (!analysis.data) {
      throw new Error("LLM 返回结果缺少 JSON 数据");
    }

    const insightsPath = historyInsightsPath(doc.userId, doc.id);
    await uploadJsonArtifact(insightsPath, analysis.data);

    const voiceProfile = await upsertVoiceProfile(doc, analysis.data.voice);
    const metadataPatch = {
      processingStatus: "READY",
      processedAt: nowIso(),
      tokensUsed: analysis.raw?.usage?.total_tokens,
      summary: analysis.data.summary,
      voice: analysis.data.voice,
      dosAndDonts: analysis.data.dosAndDonts,
      structure: analysis.data.structure,
      reusableBlocks: analysis.data.reusableBlocks,
      openingPatterns: analysis.data.openingPatterns,
      transitionPlaybook: analysis.data.transitionPlaybook,
      styleRulesDraft: analysis.data.styleRulesDraft ?? null,
      styleVector: buildStyleVectorFromVoice(analysis.data.voice),
    };
    const mergedMetadata = mergeMeta(doc.metadata, metadataPatch);
    const runtimeBundle = buildRuntimeBundleFromHistoryDoc({
      id: doc.id,
      title: doc.title,
      channel: doc.channel,
      description: doc.description,
      metadata: mergedMetadata,
    });
    const runtimeArtifacts = await persistHistoryRuntimeArtifacts(doc, runtimeBundle);
    const derivative = await createHistoryDocDerivative(doc, runtimeBundle, runtimeArtifacts);

    await prisma.historyDoc.update({
      where: { id: doc.id },
      data: {
        status: "READY",
        insightsPath,
        metadata: mergedMetaInput(mergedMetadata, {
          runtimeArtifacts,
        }),
        latestDerivativeId: derivative.id,
        voiceProfileId: voiceProfile?.id,
      },
    });

    console.info(`[assets-worker] history doc ${doc.id} processed`);
  } catch (error) {
    console.error(
      `[assets-worker] history doc ${historyDocId} failed`,
      error
    );
    await prisma.historyDoc.update({
      where: { id: doc.id },
      data: {
        status: "FAILED",
        metadata: mergedMetaInput(doc.metadata, {
          processingStatus: "FAILED",
          lastError:
            error instanceof Error ? error.message : "Unknown history error",
          failedAt: nowIso(),
        }),
      },
    });
    throw error;
  }
}

async function upsertVoiceProfile(
  doc: HistoryDoc,
  voice?: HistoryVoiceProfile
) {
  if (!voice) return null;
  const profileJson = toInputJson(voice) ?? Prisma.JsonNull;
  const payload = {
    channel: doc.channel ?? undefined,
    name: voice.name || doc.title,
    description: voice.persona,
    profile: profileJson,
    metadata: toInputJson({
      historyDocId: doc.id,
      source: "history_doc",
    }) ?? undefined,
  };

  if (doc.voiceProfileId) {
    return prisma.voiceProfile.update({
      where: { id: doc.voiceProfileId },
      data: payload,
    });
  }

  return prisma.voiceProfile.create({
    data: {
      userId: doc.userId,
      ...payload,
    },
  });
}

type RuntimeArtifactPaths = {
  stylePath?: string | null;
  blocksPath?: string | null;
  casesPath?: string | null;
  applicabilityPath?: string | null;
};

async function persistHistoryRuntimeArtifacts(
  doc: HistoryDoc,
  bundle: RuntimeObjectBundle
): Promise<RuntimeArtifactPaths> {
  const artifacts: RuntimeArtifactPaths = {};
  const uploads: Array<Promise<void>> = [];

  if (bundle.style) {
    const path = historyRuntimePath(doc.userId, doc.id, "style");
    uploads.push(
      uploadJsonArtifact(path, bundle.style).then(() => {
        artifacts.stylePath = path;
      })
    );
  }
  if (bundle.writingBlocks) {
    const path = historyRuntimePath(doc.userId, doc.id, "blocks");
    uploads.push(
      uploadJsonArtifact(path, bundle.writingBlocks).then(() => {
        artifacts.blocksPath = path;
      })
    );
  }
  if (bundle.caseBank) {
    const path = historyRuntimePath(doc.userId, doc.id, "cases");
    uploads.push(
      uploadJsonArtifact(path, bundle.caseBank).then(() => {
        artifacts.casesPath = path;
      })
    );
  }
  if (bundle.applicability) {
    const path = historyRuntimePath(doc.userId, doc.id, "applicability");
    uploads.push(
      uploadJsonArtifact(path, bundle.applicability).then(() => {
        artifacts.applicabilityPath = path;
      })
    );
  }

  await Promise.all(uploads);
  return artifacts;
}

async function createHistoryDocDerivative(
  doc: HistoryDoc,
  bundle: RuntimeObjectBundle,
  artifacts: RuntimeArtifactPaths
) {
  return prisma.historyDocDerivative.create({
    data: {
      historyDocId: doc.id,
      version: "v1",
      styleSummary: toInputJson(bundle.style) ?? undefined,
      writingBlocks: toInputJson(bundle.writingBlocks) ?? undefined,
      caseBank: toInputJson(bundle.caseBank) ?? undefined,
      applicability: toInputJson(bundle.applicability) ?? undefined,
      stylePath: artifacts.stylePath ?? null,
      blocksPath: artifacts.blocksPath ?? null,
      casesPath: artifacts.casesPath ?? null,
      applicabilityPath: artifacts.applicabilityPath ?? null,
    },
  });
}

async function handleStoryJob({ storyId }: { storyId: string }) {
  const story = await prisma.storyAsset.findUnique({ where: { id: storyId } });
  if (!story) {
    console.warn(`[assets-worker] story ${storyId} not found`);
    return;
  }
  if (!story.contentPath) {
    console.warn(`[assets-worker] story ${storyId} missing contentPath`);
    await prisma.storyAsset.update({
      where: { id: story.id },
      data: {
        metadata: mergedMetaInput(story.metadata, {
          processingStatus: "FAILED",
          lastError: "未找到正文文件，请重新上传",
          failedAt: nowIso(),
        }),
      },
    });
    return;
  }

  await prisma.storyAsset.update({
    where: { id: story.id },
    data: {
      metadata: mergedMetaInput(story.metadata, {
        processingStatus: "PROCESSING",
        workerStartedAt: nowIso(),
      }),
    },
  });

  try {
    const asset = await downloadFromStorage(story.contentPath);
    const text = bufferToText(asset.buffer);
    if (!text.trim()) {
      throw new Error("故事文件为空，无法解析");
    }
    const excerpt = truncateText(text, 12000);
    const truncated = excerpt.length !== text.length;

    const analysis = await callCloudJson<StoryBlueprint>({
      model: STORY_MODEL,
      system: STORY_SYSTEM_PROMPT,
      user: buildStoryUserPrompt(story, excerpt, truncated),
      maxOutputTokens: STORY_MAX_TOKENS,
      temperature: 0.2,
      metadata: { storyId: story.id },
    });
    if (!analysis.data) {
      throw new Error("LLM 未返回结构化内容");
    }

    const structurePath = storyStructurePath(story.userId, story.id);
    await uploadJsonArtifact(structurePath, analysis.data);

    const normalizedTags = Array.from(
      new Set([...(story.tags || []), ...(analysis.data.tags || [])])
    );

    await prisma.storyAsset.update({
      where: { id: story.id },
      data: {
        summary: story.summary ?? analysis.data.synopsis,
        structure: toInputJson(analysis.data) ?? undefined,
        tags: normalizedTags,
        metadata: mergedMetaInput(story.metadata, {
          processingStatus: "READY",
          processedAt: nowIso(),
          structurePath,
          synopsis: analysis.data.synopsis,
          tokensUsed: analysis.raw?.usage?.total_tokens,
        }),
      },
    });

    console.info(`[assets-worker] story ${story.id} processed`);
  } catch (error) {
    console.error(`[assets-worker] story ${storyId} failed`, error);
    await prisma.storyAsset.update({
      where: { id: story.id },
      data: {
        metadata: mergedMetaInput(story.metadata, {
          processingStatus: "FAILED",
          lastError:
            error instanceof Error ? error.message : "Unknown story error",
          failedAt: nowIso(),
        }),
      },
    });
    throw error;
  }
}

async function handleStyleJob({ styleId }: { styleId: string }) {
  const style = await prisma.stylePreset.findUnique({ where: { id: styleId } });
  if (!style) {
    console.warn(`[assets-worker] style ${styleId} not found`);
    return;
  }
  const meta = jsonRecord(style.metadata);
  const storagePath = meta.storagePath as string | undefined;
  if (!storagePath) {
    console.warn(`[assets-worker] style ${styleId} missing storagePath`);
    await prisma.stylePreset.update({
      where: { id: style.id },
      data: {
        metadata: mergedMetaInput(style.metadata, {
          processingStatus: "FAILED",
          lastError: "未找到参考图片，请重新上传",
          failedAt: nowIso(),
        }),
      },
    });
    return;
  }

  await prisma.stylePreset.update({
    where: { id: style.id },
    data: {
      metadata: mergedMetaInput(style.metadata, {
        processingStatus: "PROCESSING",
        workerStartedAt: nowIso(),
      }),
    },
  });

  try {
    const asset = await downloadFromStorage(storagePath);
    const base64 = asset.buffer.toString("base64");
    const analysis = await callCloudJson<StyleAnalysis>({
      model: STYLE_MODEL,
      system: STYLE_SYSTEM_PROMPT,
      user: buildStyleUserPrompt(style),
      attachments: [
        {
          mimeType: asset.contentType || "image/png",
          data: base64,
        },
      ],
      maxOutputTokens: STYLE_MAX_TOKENS,
      temperature: 0.1,
      metadata: { styleId: style.id },
    });

    if (!analysis.data) {
      throw new Error("视觉分析返回为空");
    }

    const analysisPath = styleAnalysisPath(style.userId, style.id);
    await uploadJsonArtifact(analysisPath, analysis.data);

    const combinedSpec = {
      ...(typeof style.spec === "object" ? style.spec : {}),
      analysis: analysis.data,
    };

    await prisma.stylePreset.update({
      where: { id: style.id },
      data: {
        spec: toInputJson(combinedSpec) ?? undefined,
        metadata: mergedMetaInput(style.metadata, {
          processingStatus: "READY",
          processedAt: nowIso(),
          palettePreview: analysis.data.palette?.map((p) => p.hex),
          analysisPath,
          tokensUsed: analysis.raw?.usage?.total_tokens,
        }),
      },
    });

    console.info(`[assets-worker] style ${style.id} processed`);
  } catch (error) {
    console.error(`[assets-worker] style ${styleId} failed`, error);
    await prisma.stylePreset.update({
      where: { id: style.id },
      data: {
        metadata: mergedMetaInput(style.metadata, {
          processingStatus: "FAILED",
          lastError:
            error instanceof Error ? error.message : "Unknown style error",
          failedAt: nowIso(),
        }),
      },
    });
    throw error;
  }
}

const HISTORY_SYSTEM_PROMPT = `
你是一个精通私域/公众号/小红书长期运营的首席文案教练，需要分析用户上传的历史稿件，抽取可复用的“个人口吻与写法”。
务必输出一个 JSON 对象，字段和要求如下（**所有字段必须存在且不得留空字符串**）：
{
  "summary": "整篇稿件调性与主题的 1 句话总结",
  "voice": {
    "name": "",
    "persona": "",
    "toneDescriptors": ["至少 3 条单词或短语"],
    "cadence": "",
    "sentencePatterns": ["至少 2 条"],
    "hookAngles": ["至少 2 条"],
    "closingMoves": ["至少 2 条"],
    "signatureWords": ["至少 3 条"]
  },
  "dosAndDonts": {
    "mustInclude": ["具体写法或要素"],
    "avoid": ["需要避免的写法"]
  },
  "structure": {
    "sections": [
      {
        "label": "小节标题。若原文无标题，写成“段落 {index}”并说明主题",
        "goal": "该段落想达到的传播目的，至少 1 句",
        "summary": "用 2~3 句话概述该段核心内容，不能留空",
        "keywords": ["概念关键词，至少 2 个"]
      }
    ]
  },
  "reusableBlocks": {
    "hooks": ["高点击开场"],
    "transitions": ["段落衔接句"],
    "closers": ["收尾句"],
    "proofPoints": ["数据/案例/论据"]
  },
  "openingPatterns": [
    {
      "label": "开场技巧名称（如：断言+对比）",
      "usage": "适用场景/目标人群",
      "example": "基于原文改写的一句开场示例"
    }
  ],
  "transitionPlaybook": [
    {
      "label": "转折/推进方法名称",
      "pattern": "可复用句式模板",
      "usage": "什么时候用、提醒什么"
    }
  ],
  "styleRulesDraft": {
    "style_type": "",
    "voice": {
      "persona": "",
      "pov": "",
      "addressing": ""
    },
    "tone": {
      "core": [],
      "limit": ""
    },
    "length_spec": {
      "target_seconds": [],
      "word_count": {},
      "paragraphs": [],
      "sentences_per_paragraph": []
    },
    "rhythm": {},
    "structure": [],
    "trigger_rules": [],
    "hook_templates": {},
    "pain_point_templates": [],
    "demo_templates": [],
    "summary_templates": [],
    "cta_templates": [],
    "lexicon": {
      "high_frequency_words": [],
      "exaggeration_words": [],
      "exaggeration_limit": "",
      "replacement_suggestions": [],
      "banned_words": []
    },
    "quality_checklist": [],
    "notes": []
  }
}
若原文不足以支撑某字段，也请写出“暂无可复用信息”或“待补充：说明缺少的素材”而不是空字符串；styleRulesDraft 也必须给出完整键名，可用“待补充”描述。绝对不要添加其他说明文字。`.trim();

function buildHistoryUserPrompt(
  doc: HistoryDoc,
  excerpt: string,
  truncated: boolean
) {
  const note = truncated
    ? "⚠️ 内容较长，已截取前 15,000 字供分析。"
    : "";
  return `
文档标题：${doc.title}
所属频道：${doc.channel ?? "未填写"}
${note}

正文预览：
-----
${excerpt}
-----`.trim();
}

const STORY_SYSTEM_PROMPT = `
你是剧情结构顾问，需要把品牌或个人案例整理成可复用的“故事蓝图”。
产出 JSON：
{
  "synopsis": "",
  "protagonist": "",
  "desire": "",
  "conflict": "",
  "resolution": "",
  "beats": [
    { "order": 1, "title": "", "description": "", "objective": "", "channelIdeas": [] }
  ],
  "tags": [],
  "repurposeIdeas": []
}
所有字段必须存在。`.trim();

function buildStoryUserPrompt(
  story: StoryAsset,
  excerpt: string,
  truncated: boolean
) {
  const note = truncated
    ? "⚠️ 已截取部分内容，请保留核心剧情线索。"
    : "";
  return `
故事标题：${story.title}
渠道：${story.channel ?? "未填写"}
${note}

正文：
-----
${excerpt}
-----`.trim();
}

const STYLE_SYSTEM_PROMPT = `
你是视觉总监，需要从一张参考图中萃取风格说明，用于后续 AIGC 再创作。
输出 JSON：
{
  "palette": [{"hex": "#FFE2E6", "usage": "背景/主色"}],
  "typography": { "primary": "", "secondary": "", "casing": "" },
  "motifs": [],
  "layout": { "density": "", "composition": "", "spacingNotes": "" },
  "lighting": "",
  "texture": "",
  "promptKit": { "positive": [], "negative": [] }
}
palette 至少 3 种颜色，promptKit 内容需可直接放入绘图提示。`.trim();

function buildStyleUserPrompt(style: StylePreset) {
  return `
风格名称：${style.name}
类型：${style.type}
补充描述：${style.description ?? "无"}

请结合上方文字与图像准确提炼风格特征。`.trim();
}

async function bootstrap() {
  await Promise.all([
    subscribeAssetJob(
      assetJobNames.history,
      (payload) => handleHistoryDocJob(payload),
      { localConcurrency: HISTORY_CONCURRENCY }
    ),
    subscribeAssetJob(
      assetJobNames.stories,
      (payload) => handleStoryJob(payload),
      { localConcurrency: STORY_CONCURRENCY }
    ),
    subscribeAssetJob(
      assetJobNames.styles,
      (payload) => handleStyleJob(payload),
      { localConcurrency: STYLE_CONCURRENCY }
    ),
  ]);
  console.info("[assets-worker] listening for asset jobs");
}

async function shutdown() {
  const boss = await getBoss();
  await boss.stop();
  console.info("[assets-worker] stopped queue");
  process.exit(0);
}

process.on("SIGINT", () => {
  shutdown().catch((error) => {
    console.error("shutdown error", error);
    process.exit(1);
  });
});

process.on("SIGTERM", () => {
  shutdown().catch((error) => {
    console.error("shutdown error", error);
    process.exit(1);
  });
});

bootstrap().catch((error) => {
  console.error("[assets-worker] failed to start", error);
  process.exit(1);
});
