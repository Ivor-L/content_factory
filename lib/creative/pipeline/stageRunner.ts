import { callCloudChat, callCloudJson } from "@/lib/cloudLLM";
import type { CreativeTaskMetadata } from "@/types/creative";
import type { CreativeStageKey } from "@/lib/creativeStages";
import { getStageConfig } from "@/lib/creativeStages";
import { creativeSystemBase } from "@/lib/creative/prompts/baseSystem";
import type { LoadedCreativeTask } from "@/lib/creativeTaskService";
import { retrieveKnowledgeBundle } from "@/lib/creative/retrieval";
import { buildStageInputPayload } from "@/lib/creative/runtime/runtimeInputBuilder";
import type { StageInputPayload } from "@/lib/creative/runtime/runtimeInputBuilder";
import type { StageResult } from "@/types/creativeRuntime";
import { validateStageResult, type StageValidationOutcome } from "@/lib/creative/validators";
import type { StageValidationContext } from "@/lib/creative/validators";

// 推荐使用更强大的模型以提升内容质量：gpt-4o, gpt-4-turbo, claude-3-5-sonnet-20241022
// 可通过环境变量 CLOUD_WRITING_MODEL 配置
const CREATIVE_MODEL =
  process.env.CLOUD_WRITING_MODEL || process.env.CLOUD_DEFAULT_MODEL || "gpt-4o-mini";

const JSON_STAGE_TOKEN_LIMITS: Partial<Record<CreativeStageKey, number>> = {
  diagnosis: 900,
  mining: 1400,
  topic: 1300,
  framework: 1800,
};

const DEFAULT_JSON_TOKEN_LIMIT = 1200;
const DRAFT_TOKEN_LIMIT = 3500;
const MAX_ATTEMPTS = 3;

export interface StageRunResult {
  stage: CreativeStageKey;
  result: StageResult;
  validation: StageValidationOutcome;
  stageInput: Record<string, any>;
}

export async function runStagePipeline(
  task: LoadedCreativeTask,
  metadata: CreativeTaskMetadata,
  stage: CreativeStageKey,
): Promise<StageRunResult> {
  const stageConfig = getStageConfig(stage);
  const retrievalBundle = retrieveKnowledgeBundle(task, metadata, stage);
  const stageInput = buildStageInputPayload(task, metadata, stage, retrievalBundle);
  const validatorContext = buildValidatorContext(task, metadata, stage, stageInput);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const llmResponse = await invokeModel(stageConfig, stageInput, stage);
    const aiOutput = llmResponse.data ?? llmResponse.text;
    const result: StageResult = {
      stage,
      aiOutput,
      rawText: llmResponse.text,
    } as StageResult;
    const validation = validateStageResult(stage, result, validatorContext);
    if (validation.status === "pass") {
      return { stage, stageInput, result, validation };
    }
    if (validation.status === "fix" && validation.patchedResult) {
      return {
        stage,
        result: validation.patchedResult,
        validation,
        stageInput,
      };
    }
    if (attempt === MAX_ATTEMPTS) {
      return { stage, result, validation, stageInput };
    }
  }

  throw new Error(`Stage ${stage} failed without validator decision`);
}

async function invokeModel(
  stageConfig: ReturnType<typeof getStageConfig>,
  payload: Record<string, any>,
  stage: CreativeStageKey,
) {
  const systemPrompt = [creativeSystemBase, stageConfig.systemPrompt].join("\n");
  const serializedPayload = JSON.stringify(payload, null, 2);

  if (stageConfig.autoMode === "json") {
    return callCloudJson<any>({
      model: CREATIVE_MODEL,
      system: systemPrompt,
      user: [
        `Stage: ${stage}`,
        "Payload:",
        serializedPayload,
        "",
        "Schema:",
        stageConfig.schemaDescription,
        "",
        "Return strict JSON.",
      ].join("\n"),
      maxOutputTokens: resolveJsonTokenLimit(stage),
      temperature: resolveStageTemperature(stage),
      metadata: {
        taskStage: stage,
      },
    });
  }

  return callCloudChat({
    model: CREATIVE_MODEL,
    system: systemPrompt,
    user: [
      `Stage: ${stage}`,
      "Payload:",
      serializedPayload,
      "",
      "Return plain Chinese text only.",
    ].join("\n"),
    maxOutputTokens: DRAFT_TOKEN_LIMIT,
    temperature: resolveStageTemperature(stage),
    metadata: {
      taskStage: stage,
    },
  });
}

function resolveJsonTokenLimit(stage: CreativeStageKey) {
  return JSON_STAGE_TOKEN_LIMITS[stage] ?? DEFAULT_JSON_TOKEN_LIMIT;
}

const STAGE_TEMPERATURES: Partial<Record<CreativeStageKey, number>> = {
  diagnosis: 0.25,
  mining: 0.3,
  topic: 0.32,
  framework: 0.35,
  draft: 0.55,
};
const DEFAULT_STAGE_TEMPERATURE = 0.35;

function resolveStageTemperature(stage: CreativeStageKey) {
  return STAGE_TEMPERATURES[stage] ?? DEFAULT_STAGE_TEMPERATURE;
}

function buildValidatorContext(
  task: LoadedCreativeTask,
  metadata: CreativeTaskMetadata,
  stage: CreativeStageKey,
  stageInput: StageInputPayload,
): StageValidationContext {
  const framework = metadata.stages?.framework?.aiOutput;
  return {
    stage,
    frameworkSections: framework?.sections ?? [],
    closingCTA: framework?.closingCTA,
    expectedSectionCount: framework?.sections?.length,
    userMaterialsCount: task.stories.length,
     userMaterials: stageInput?.userMaterials ?? [],
     runtimeTemplates: collectRuntimeTemplates(stageInput),
    taskOverview: stageInput?.taskOverview ?? null,
  };
}

function collectRuntimeTemplates(stageInput: StageInputPayload) {
  const templates: string[] = [];
  const push = (value?: unknown) => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        templates.push(trimmed);
      }
    }
  };
  if (Array.isArray((stageInput as any).runtimeHooks)) {
    for (const hook of (stageInput as any).runtimeHooks) {
      push(hook?.template);
      push(hook?.value);
    }
  }
  if (Array.isArray((stageInput as any).runtimeTransitions)) {
    for (const transition of (stageInput as any).runtimeTransitions) {
      push(transition?.rewriteCue);
      push(transition?.trigger);
    }
  }
  if (Array.isArray((stageInput as any).runtimeClosing)) {
    for (const closing of (stageInput as any).runtimeClosing) {
      push(closing?.valueProp);
      push(closing?.preferredCTA);
    }
  }
  return templates;
}
