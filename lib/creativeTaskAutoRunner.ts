import type { CreativeStageKey } from "./creativeStages";
import { creativeStageOrder } from "./creativeStages";
import { generateStageForTask } from "./creativeAi";

interface AutoGenerateParams {
  taskId: string;
  userId: string;
  startStage?: CreativeStageKey;
  targetStage?: CreativeStageKey;
  maxIterations?: number;
}

export async function autoGenerateCreativeTask({
  taskId,
  userId,
  startStage = "diagnosis",
  targetStage = "draft",
  maxIterations = creativeStageOrder.length,
}: AutoGenerateParams) {
  let currentStage: CreativeStageKey | null = startStage;
  let iterations = 0;
  let lastResult: Awaited<ReturnType<typeof generateStageForTask>> | null = null;
  const visited = new Set<CreativeStageKey>();

  while (currentStage && iterations < maxIterations) {
    iterations += 1;
    visited.add(currentStage);
    lastResult = await generateStageForTask(taskId, userId, currentStage);
    if (currentStage === targetStage || !lastResult?.nextStage) {
      break;
    }
    currentStage = lastResult.nextStage;
    if (!currentStage || visited.has(currentStage)) {
      break;
    }
  }

  return lastResult;
}
