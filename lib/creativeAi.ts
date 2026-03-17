import type { CreativeStageKey } from "./creativeStages";
import { creativeStageOrder, getNextStage, isGatingStage } from "./creativeStages";
import { loadTaskWithAssets, parseMetadata } from "./creativeTaskService";
import {
  ensureStageTransition,
  resetStageAiState,
  resetStagesAfter,
  setStageMeta,
  skipStages,
} from "./creativeTaskUtils";
import type { CreativeStageStatus, CreativeTaskMetadata } from "@/types/creative";
import prisma from "./prisma";
import { runStagePipeline } from "./creative/pipeline/stageRunner";
import { toInputJson } from "./jsonUtils";

export async function generateStageForTask(taskId: string, userId: string, stage: CreativeStageKey) {
  const task = await loadTaskWithAssets(taskId, userId);
  if (!task) {
    throw new Error("Task not found");
  }

  if (task.stage !== stage && !allowedStageRegression(task.stage as CreativeStageKey, stage)) {
    throw new Error("阶段不匹配，请先完成前序阶段");
  }

  const metadata = parseMetadata(task.metadata);
  const stageRun = await runStagePipeline(task, metadata, stage);

  const decision = computeNextStage(stage, stageRun.result.aiOutput, metadata);
  const updatedMetadata = updateMetadataWithOutput(
    metadata,
    stage,
    stageRun.result.aiOutput,
    stageRun.result.rawText,
    stageRun.stageInput,
    stageRun.validation,
    decision,
  );

  await prisma.$transaction([
    prisma.creativeTask.update({
      where: { id: task.id },
      data: {
        metadata: toInputJson(updatedMetadata) ?? undefined,
        stage: decision.nextStage ?? stage,
        updatedAt: new Date(),
      },
    }),
    prisma.creativeEvent.create({
      data: {
        taskId: task.id,
        type: `stage:${stage}:auto`,
        payload: toInputJson({
          aiOutput: stageRun.result.aiOutput,
          validation: stageRun.validation,
          stageInput: stageRun.stageInput,
          route: decision.route,
        }),
      },
    }),
  ]);

  return {
    aiOutput: stageRun.result.aiOutput,
    stage,
    nextStage: decision.nextStage ?? null,
    metadata: updatedMetadata,
    validation: stageRun.validation,
  };
}

type StageTransitionDecision = {
  nextStage?: CreativeStageKey | null;
  stageToActivate?: CreativeStageKey | null;
  route?: "clear" | "fuzzy";
  status?: CreativeStageStatus;
  skipStages?: CreativeStageKey[];
};

function computeNextStage(
  stage: CreativeStageKey,
  aiOutput: any,
  metadata: CreativeTaskMetadata,
): StageTransitionDecision {
  if (stage === "diagnosis") {
    const clarity = String(aiOutput?.clarity ?? "").toLowerCase();
    const recommendedRoute = String(aiOutput?.recommendedRoute ?? "").toLowerCase();
    if (clarity === "clear") {
      const resolvedRoute = recommendedRoute === "mining" ? "mining" : "framework";
      const nextStage = resolvedRoute === "mining" ? ("mining" as CreativeStageKey) : "framework";
      return {
        nextStage,
        stageToActivate: nextStage,
        route: "clear",
        status: "completed",
        skipStages: resolvedRoute === "framework" ? ["mining", "topic"] : undefined,
      };
    }
    return {
      nextStage: stage,
      stageToActivate: stage,
      route: "fuzzy",
      status: "in_progress",
    };
  }
  return {
    nextStage: getNextStage(stage),
    stageToActivate: getNextStage(stage),
    route: metadata.route,
    status: "completed",
  };
}

function updateMetadataWithOutput(
  metadata: CreativeTaskMetadata,
  stage: CreativeStageKey,
  aiOutput: any,
  rawText: string,
  stageInput: Record<string, any>,
  validation: { status: string; message?: string } | undefined,
  decision: StageTransitionDecision,
) {
  let nextMetadata = metadata;

  if (isGatingStage(stage)) {
    if ((decision.status ?? "completed") === "in_progress") {
      nextMetadata = resetStageAiState(nextMetadata, stage, "in_progress");
    }
    nextMetadata = resetStagesAfter(nextMetadata, stage, () => "pending");
  }

  const stagePatch: Parameters<typeof setStageMeta>[2] = {
    status: decision.status ?? "completed",
    aiOutput,
    rawText,
    stageInput,
    validatorState: validation
      ? { status: validation.status, message: validation.message }
      : undefined,
  };
  if (stage === "topic") {
    stagePatch.userSelections = null;
  }
  nextMetadata = setStageMeta(nextMetadata, stage, stagePatch);

  if (decision.route) {
    nextMetadata.route = decision.route;
  }

  if (isGatingStage(stage) && decision.skipStages?.length) {
    nextMetadata = skipStages(nextMetadata, decision.skipStages);
  }

  const shouldCompleteStage = (decision.status ?? "completed") === "completed";
  if (shouldCompleteStage) {
    nextMetadata = ensureStageTransition(nextMetadata, stage, decision.stageToActivate ?? null);
  }

  return nextMetadata;
}

function allowedStageRegression(currentStage: CreativeStageKey, requestedStage: CreativeStageKey) {
  const currentIndex = creativeStageOrder.indexOf(currentStage);
  const requestedIndex = creativeStageOrder.indexOf(requestedStage);
  return requestedIndex <= currentIndex;
}
