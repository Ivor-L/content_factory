import { z } from "zod";
import type { CreativeStageKey } from "@/lib/creativeStages";

export type CreativeStage = CreativeStageKey;

export interface StageResultBase<TStage extends CreativeStageKey, TPayload = unknown> {
  stage: TStage;
  rawText: string;
  aiOutput: TPayload;
}

export interface Stage00Result
  extends StageResultBase<
    "diagnosis",
    {
      clarity: "clear" | "fuzzy";
      summary: string;
      recommendedRoute: "framework" | "mining";
      audienceNeed: string;
      keyQuestions: string[];
      risks: string[];
      nextActions: string[];
      notes?: string;
    }
  > {}

export interface Stage01Result
  extends StageResultBase<
    "mining",
    {
      insights: Array<{
        label: string;
        detail: string;
        audiencePain: string;
        evidence: string[];
        potentialAngles: string[];
        recommendedStage: "opening" | "body" | "closing";
      }>;
      stories: Array<{
        title: string;
        summary: string;
        usage: string;
        tone: string;
      }>;
      dataPoints: Array<{
        fact: string;
        source: string;
        implication: string;
      }>;
      gaps: string[];
      voiceTips: string[];
    }
  > {}

export interface Stage02Result
  extends StageResultBase<
    "topic",
    {
      coreTopic: string;
      promise: string;
      heroSentence: string;
      angles: Array<{
        name: string;
        hook: string;
        audience: string;
        proofPoint: string;
      }>;
      titles: string[];
      outlineBullets: string[];
      proofPoints: string[];
      audienceObjections: string[];
    }
  > {}

export interface Stage03Result
  extends StageResultBase<
    "framework",
    {
      opening: {
        hook: string;
        tension: string;
        promise: string;
      };
      sections: Array<{
        order: number;
        functionCue: string;
        goal: string;
        keyPoints: string[];
        evidence: string[];
        tone: string;
        contentType: string;
        cta: string;
        storyCue?: string;
      }>;
      transitions: string[];
      headline: string;
      closingCTA: string;
      styleReminders: string[];
    }
  > {}

export interface Stage04Result extends StageResultBase<"draft", string> {}

export type StageResult =
  | Stage00Result
  | Stage01Result
  | Stage02Result
  | Stage03Result
  | Stage04Result;

export const RuntimeStyleSummarySchema = z.object({
  objectType: z.literal("historical_style_summary"),
  docId: z.string(),
  version: z.string(),
  sourceInsightPath: z.string(),
  channel: z.string().nullable(),
  personaTags: z.array(z.string()).default([]),
  voiceSynopsis: z.string(),
  sentencePatterns: z.array(z.string()).max(6),
  pacingMarkers: z
    .array(z.enum(["slow-build", "rapid-fire", "story"]))
    .default(["story"]),
  guardrails: z.array(z.string()).default([]),
  priorityScore: z.number().min(0).max(1),
  updatedAt: z.string(),
});

export type RuntimeStyleSummary = z.infer<typeof RuntimeStyleSummarySchema>;

export const RuntimeWritingBlocksSchema = z.object({
  objectType: z.literal("historical_writing_blocks"),
  docId: z.string(),
  reusableHooks: z.array(
    z.object({
      patternId: z.string(),
      template: z.string(),
      usageHint: z.string().optional(),
    }),
  ),
  transitions: z.array(
    z.object({
      patternId: z.string(),
      trigger: z.string(),
      rewriteCue: z.string(),
    }),
  ),
  closings: z.array(
    z.object({
      patternId: z.string(),
      valueProp: z.string(),
      preferredCTA: z.string().optional(),
    }),
  ),
  structureSections: z.array(
    z.object({
      slot: z.string(),
      goal: z.string(),
      proofCue: z.string(),
    }),
  ),
  styleVector: z.array(z.number()).length(16),
  updatedAt: z.string(),
});

export type RuntimeWritingBlocks = z.infer<typeof RuntimeWritingBlocksSchema>;

export const RuntimeCaseCardSchema = z.object({
  docId: z.string(),
  caseId: z.string(),
  title: z.string(),
  summary: z.string(),
  metrics: z
    .object({
      before: z.string().optional(),
      after: z.string().optional(),
      delta: z.string().optional(),
    })
    .optional(),
  usageStage: z.enum(["hook", "body", "closing"]),
  personaFit: z.array(z.string()),
  sourceSnippet: z.string(),
});

export type RuntimeCaseCard = z.infer<typeof RuntimeCaseCardSchema>;

export const RuntimeCaseBankSchema = z.object({
  objectType: z.literal("historical_case_bank"),
  docId: z.string(),
  cases: z.array(RuntimeCaseCardSchema),
  evidences: z.array(
    z.object({
      factId: z.string(),
      fact: z.string(),
      source: z.string(),
    }),
  ),
  updatedAt: z.string(),
});

export type RuntimeCaseBank = z.infer<typeof RuntimeCaseBankSchema>;

export const ApplicabilityMetadataSchema = z.object({
  objectType: z.literal("applicability_metadata"),
  docId: z.string(),
  channel: z.string().nullable(),
  assetType: z.enum(["longform", "short", "script", "ad"]),
  audienceTags: z.array(z.string()),
  forbiddenUseCases: z.array(z.string()).default([]),
  recommendedStages: z.array(z.enum(["style", "hook", "case"])),
  freshnessScore: z.number(),
  lastUsedAt: z.string().nullable(),
  manualNotes: z.string().nullable(),
});

export type ApplicabilityMetadata = z.infer<typeof ApplicabilityMetadataSchema>;

export interface RetrievalContext {
  taskId: string;
  stage: CreativeStageKey;
  channel?: string | null;
  assetType?: string | null;
  goalTags: string[];
  voiceProfile?: {
    embedding?: number[];
    tags?: string[];
  } | null;
  userMaterialsCount: number;
  selectedAngles?: string[];
}

export interface RetrievedKnowledgeBundle {
  styles: RuntimeStyleSummary[];
  writingBlocks: RuntimeWritingBlocks[];
  cases: RuntimeCaseCard[];
  applicability: ApplicabilityMetadata[];
}
