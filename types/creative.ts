import type { CreativeStageKey } from "@/lib/creativeStages";

export type CreativeStageStatus = "pending" | "in_progress" | "completed" | "blocked" | "failed";

export type StyleRules = Record<string, any>;

export interface PosterImageAsset {
  id?: string | null;
  url: string;
  fileName?: string | null;
  prompt?: string | null;
  mimeType?: string | null;
  index?: number | null;
}

export interface StageMetaEntry {
  key: CreativeStageKey;
  status: CreativeStageStatus;
  aiOutput?: any;
  rawText?: string | null;
  stageInput?: Record<string, any> | null;
  validatorState?: {
    status: string;
    message?: string;
  };
  userNotes?: string | null;
  manualContent?: string | null;
  tokensUsed?: number;
  updatedAt?: string;
  userSelections?: Record<string, any> | TopicUserSelections | null;
}

export type TaskActionKind = "poster" | "digitalHuman";

export type TaskActionState = {
  status: "pending" | "ready" | "error";
  jobId?: string | null;
  error?: string | null;
  updatedAt?: string;
};

export interface CreativeTaskCustomMetadata {
  styleRules?: StyleRules | null;
  [key: string]: any;
}

export interface CreativeTaskMetadata {
  route?: "clear" | "fuzzy";
  stages?: Record<CreativeStageKey, StageMetaEntry>;
  custom?: CreativeTaskCustomMetadata;
  actions?: Partial<Record<TaskActionKind, TaskActionState>>;
}

export interface CreativeTaskSummary {
  id: string;
  title?: string | null;
  stage: CreativeStageKey;
  status: string;
  ideaText?: string | null;
  targetOutput?: string | null;
  goal?: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
  metadata?: CreativeTaskMetadata | null;
  channel?: string | null;
  attachments?: {
    historyDocs: number;
    stories: number;
    styles: number;
  };
  generatedImages?: PosterImageAsset[] | null;
}

export interface HistoryDocDerivativeLite {
  id: string;
  version: string;
  styleSummary?: Record<string, any> | null;
  writingBlocks?: Record<string, any> | null;
  caseBank?: Record<string, any> | null;
  applicability?: Record<string, any> | null;
  stylePath?: string | null;
  blocksPath?: string | null;
  casesPath?: string | null;
  applicabilityPath?: string | null;
}

export interface HistoryDocLite {
  id: string;
  title: string;
  channel?: string | null;
  description?: string | null;
  metadata?: Record<string, any> | null;
  latestDerivative?: HistoryDocDerivativeLite | null;
}

export interface StoryAssetLite {
  id: string;
  title: string;
  summary?: string | null;
  channel?: string | null;
  tags?: string[] | null;
  structure?: Record<string, any> | null;
}

export interface StylePresetLite {
  id: string;
  name: string;
  type: string;
  description?: string | null;
  spec?: Record<string, any> | null;
  previewUrl?: string | null;
}

export interface VoiceProfileLite {
  id: string;
  name?: string | null;
  description?: string | null;
  profile: Record<string, any>;
}

export interface CreativeTaskDetail extends CreativeTaskSummary {
  voiceProfile?: VoiceProfileLite | null;
  historyDocs: HistoryDocLite[];
  stories: StoryAssetLite[];
  styles: StylePresetLite[];
}

export type TopicSelectionAngle = {
  key?: string | null;
  name?: string | null;
  hook?: string | null;
  audience?: string | null;
  proofPoint?: string | null;
};

export type TopicSelectionItem = {
  key?: string | null;
  value: string;
};

export interface TopicUserSelections {
  coreTopic?: string | null;
  heroSentence?: string | null;
  promise?: string | null;
  angles?: TopicSelectionAngle[];
  titles?: TopicSelectionItem[];
  outline?: TopicSelectionItem[];
}
