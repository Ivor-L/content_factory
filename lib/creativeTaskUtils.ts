import type { CreativeStageKey } from "./creativeStages";
import { creativeStageOrder } from "./creativeStages";
import type {
  CreativeTaskMetadata,
  CreativeStageStatus,
  StageMetaEntry,
  TaskActionKind,
  TaskActionState,
} from "@/types/creative";

export function initMetadata(): CreativeTaskMetadata {
  const stages: Record<CreativeStageKey, StageMetaEntry> = {} as Record<
    CreativeStageKey,
    StageMetaEntry
  >;
  for (const key of creativeStageOrder) {
    stages[key] = {
      key,
      status: key === "diagnosis" ? "in_progress" : "pending",
    };
  }
  return { stages, actions: {}, custom: {} };
}

export function getStageMeta(
  metadata: CreativeTaskMetadata | null | undefined,
  stage: CreativeStageKey
): StageMetaEntry | undefined {
  return metadata?.stages?.[stage];
}

export function getTaskActionStatus(
  metadata: CreativeTaskMetadata | null | undefined,
  action: TaskActionKind
): TaskActionState | undefined {
  return metadata?.actions?.[action];
}

export function setStageMeta(
  metadata: CreativeTaskMetadata | null | undefined,
  stage: CreativeStageKey,
  patch: Partial<StageMetaEntry>
): CreativeTaskMetadata {
  const next: CreativeTaskMetadata = metadata
    ? JSON.parse(JSON.stringify(metadata))
    : initMetadata();
  if (!next.stages) {
    next.stages = initMetadata().stages;
  }
  const stages = next.stages as Record<CreativeStageKey, StageMetaEntry>;
  const prev = stages[stage] ?? { key: stage, status: "pending" as CreativeStageStatus };
  stages[stage] = {
    ...prev,
    ...patch,
    key: stage,
    updatedAt: new Date().toISOString(),
  };
  return next;
}

export function resetStageAiState(
  metadata: CreativeTaskMetadata | null | undefined,
  stage: CreativeStageKey,
  status: CreativeStageStatus = "pending",
): CreativeTaskMetadata {
  const patch: Partial<StageMetaEntry> = {
    status,
    aiOutput: null,
    rawText: null,
    stageInput: null,
    validatorState: undefined,
    tokensUsed: undefined,
  };
  if (stage === "topic") {
    patch.userSelections = null;
  }
  return setStageMeta(metadata, stage, patch);
}

export function resetStagesAfter(
  metadata: CreativeTaskMetadata | null | undefined,
  stage: CreativeStageKey,
  resolveStatus?: (stage: CreativeStageKey) => CreativeStageStatus,
  options?: { includeCurrent?: boolean },
) {
  const includeCurrent = options?.includeCurrent ?? false;
  const startIndex = creativeStageOrder.indexOf(stage);
  if (startIndex === -1) {
    return metadata ?? initMetadata();
  }
  let next = metadata ?? initMetadata();
  const begin = includeCurrent ? startIndex : startIndex + 1;
  for (let i = begin; i < creativeStageOrder.length; i += 1) {
    const key = creativeStageOrder[i];
    const status = resolveStatus ? resolveStatus(key) : "pending";
    next = resetStageAiState(next, key, status);
  }
  return next;
}

export type TaskActionStatusPatch = Partial<TaskActionState> & {
  status?: TaskActionState["status"];
};

export function setTaskActionStatus(
  metadata: CreativeTaskMetadata | null | undefined,
  action: TaskActionKind,
  patch: TaskActionStatusPatch
): CreativeTaskMetadata {
  const next: CreativeTaskMetadata = metadata
    ? JSON.parse(JSON.stringify(metadata))
    : initMetadata();
  const actions = next.actions ?? (next.actions = initMetadata().actions ?? {});
  const prev = actions[action];
  const resolvedStatus = patch.status ?? prev?.status ?? "pending";
  actions[action] = {
    status: resolvedStatus,
    jobId: patch.jobId ?? prev?.jobId,
    error:
      patch.error !== undefined
        ? patch.error ?? undefined
        : resolvedStatus === "error"
          ? prev?.error
          : undefined,
    updatedAt: patch.updatedAt ?? new Date().toISOString(),
  };
  return next;
}

export function markStageStatus(
  metadata: CreativeTaskMetadata | null | undefined,
  stage: CreativeStageKey,
  status: CreativeStageStatus
) {
  return setStageMeta(metadata, stage, { status });
}

export function ensureStageTransition(
  metadata: CreativeTaskMetadata | null | undefined,
  currentStage: CreativeStageKey,
  nextStage?: CreativeStageKey | null
) {
  let nextMetadata = metadata ?? initMetadata();
  nextMetadata = markStageStatus(nextMetadata, currentStage, "completed");
  if (nextStage) {
    nextMetadata = markStageStatus(nextMetadata, nextStage, "in_progress");
  }
  return nextMetadata;
}

export function skipStages(
  metadata: CreativeTaskMetadata | null | undefined,
  stages: CreativeStageKey[]
) {
  let next = metadata ?? initMetadata();
  for (const stage of stages) {
    next = resetStageAiState(next, stage, "blocked");
  }
  return next;
}
