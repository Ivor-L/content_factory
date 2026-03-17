import crypto from "node:crypto";
import type { HistoryDocDerivativeLite, HistoryDocLite } from "@/types/creative";
import {
  ApplicabilityMetadataSchema,
  RuntimeCaseBankSchema,
  RuntimeCaseCard,
  RuntimeStyleSummarySchema,
  RuntimeWritingBlocksSchema,
  type ApplicabilityMetadata,
  type RuntimeCaseBank,
  type RuntimeStyleSummary,
  type RuntimeWritingBlocks,
} from "@/types/creativeRuntime";

function randomId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function stubVector(length = 16) {
  return Array.from({ length }, (_, idx) => Number((idx / length).toFixed(3)));
}

export interface RuntimeObjectBundle {
  style?: RuntimeStyleSummary;
  writingBlocks?: RuntimeWritingBlocks;
  caseBank?: RuntimeCaseBank;
  applicability?: ApplicabilityMetadata;
}

export function buildRuntimeBundleFromHistoryDoc(doc: HistoryDocLite): RuntimeObjectBundle {
  if (doc.latestDerivative) {
    return buildRuntimeBundleFromDerivative(doc.latestDerivative);
  }
  return buildRuntimeBundleFromLegacyMetadata(doc);
}

function buildRuntimeBundleFromDerivative(derivative: HistoryDocDerivativeLite): RuntimeObjectBundle {
  const styleResult = derivative.styleSummary
    ? RuntimeStyleSummarySchema.safeParse(derivative.styleSummary)
    : null;
  const writingBlocksResult = derivative.writingBlocks
    ? RuntimeWritingBlocksSchema.safeParse(derivative.writingBlocks)
    : null;
  const caseBankResult = derivative.caseBank
    ? RuntimeCaseBankSchema.safeParse(derivative.caseBank)
    : null;
  const applicabilityResult = derivative.applicability
    ? ApplicabilityMetadataSchema.safeParse(derivative.applicability)
    : null;

  const style = styleResult?.success ? styleResult.data : undefined;
  const writingBlocks = writingBlocksResult?.success ? writingBlocksResult.data : undefined;
  const caseBank = caseBankResult?.success ? caseBankResult.data : undefined;
  const applicability = applicabilityResult?.success ? applicabilityResult.data : undefined;

  return {
    style,
    writingBlocks,
    caseBank,
    applicability,
  };
}

function buildRuntimeBundleFromLegacyMetadata(doc: HistoryDocLite): RuntimeObjectBundle {
  const meta = (doc.metadata ?? {}) as Record<string, any>;
  const now = new Date().toISOString();

  const styleInput = {
    objectType: "historical_style_summary" as const,
    docId: doc.id,
    version: "v0",
    sourceInsightPath: meta.insightsPath ?? "",
    channel: doc.channel ?? null,
    personaTags: meta.voice?.toneDescriptors ?? [],
    voiceSynopsis: meta.summary ?? meta.voice?.persona ?? doc.description ?? "",
    sentencePatterns:
      meta.voice?.sentencePatterns ??
      (Array.isArray(meta.openingPatterns)
        ? meta.openingPatterns.slice(0, 4).map((p: any) => p?.label ?? p?.usage ?? "")
        : []),
    pacingMarkers:
      meta.voice?.cadence === "快节奏"
        ? ["rapid-fire"]
        : meta.voice?.cadence === "慢热"
          ? ["slow-build"]
          : ["story"],
    guardrails: meta.dosAndDonts?.avoid ?? [],
    priorityScore: typeof meta.priorityScore === "number" ? meta.priorityScore : 0.5,
    updatedAt: meta.processedAt ?? now,
  };

  const writingBlocksInput = {
    objectType: "historical_writing_blocks" as const,
    docId: doc.id,
    reusableHooks: (meta.reusableBlocks?.hooks ?? []).slice(0, 8).map((hook: any, idx: number) => ({
      patternId: hook?.patternId ?? randomId(`hook${idx}`),
      template: typeof hook === "string" ? hook : hook?.template ?? "",
      usageHint: hook?.usage ?? hook?.note,
    })),
    transitions: (meta.transitionPlaybook ?? []).slice(0, 8).map((item: any, idx: number) => ({
      patternId: item?.patternId ?? randomId(`transition${idx}`),
      trigger: item?.label ?? `转折${idx + 1}`,
      rewriteCue: item?.pattern ?? item?.usage ?? "",
    })),
    closings: (meta.reusableBlocks?.closers ?? []).slice(0, 5).map((closer: any, idx: number) => ({
      patternId: closer?.patternId ?? randomId(`closing${idx}`),
      valueProp: typeof closer === "string" ? closer : closer?.value ?? "",
      preferredCTA: closer?.cta ?? meta.closingCTA ?? undefined,
    })),
    structureSections:
      (meta.structure?.sections ?? []).map((section: any, idx: number) => ({
        slot: section?.label ?? `section-${idx + 1}`,
        goal: section?.goal ?? section?.summary ?? "",
        proofCue: Array.isArray(section?.keywords) ? section.keywords.join("、") : "",
      })) ?? [],
    styleVector: Array.isArray(meta.styleVector) ? meta.styleVector : stubVector(),
    updatedAt: meta.processedAt ?? now,
  };

  const caseBankInput = {
    objectType: "historical_case_bank" as const,
    docId: doc.id,
    cases: (meta.reusableBlocks?.proofPoints ?? []).slice(0, 6).map((text: any, idx: number) => {
      const caseId = randomId(`case${idx}`);
      const summary = typeof text === "string" ? text : text?.summary ?? "";
      const metrics =
        typeof text === "object" && text?.metrics
          ? text.metrics
          : undefined;
      const personaFit = Array.isArray(text?.personaFit) ? text.personaFit : meta.voice?.toneDescriptors ?? [];
      const usageStage =
        typeof text?.usageStage === "string"
          ? text.usageStage
          : idx === 0
            ? "hook"
            : "body";
      return {
        docId: doc.id,
        caseId,
        title: text?.title ?? `案例 ${idx + 1}`,
        summary,
        metrics,
        usageStage,
        personaFit,
        sourceSnippet: text?.sourceSnippet ?? summary ?? "",
      };
    }),
    evidences: (meta.dataPoints ?? []).slice(0, 5).map((fact: any, idx: number) => ({
      factId: randomId(`fact${idx}`),
      fact: fact?.fact ?? fact?.text ?? "",
      source: fact?.source ?? doc.title ?? "history_doc",
    })),
    updatedAt: meta.processedAt ?? now,
  };

  const applicabilityInput = {
    objectType: "applicability_metadata" as const,
    docId: doc.id,
    channel: doc.channel ?? null,
    assetType: (meta.assetType as "longform" | "short" | "script" | "ad") ?? "longform",
    audienceTags: Array.isArray(meta.audienceTags) ? meta.audienceTags : [],
    forbiddenUseCases: Array.isArray(meta.forbiddenUseCases) ? meta.forbiddenUseCases : [],
    recommendedStages: Array.isArray(meta.recommendedStages)
      ? meta.recommendedStages
      : ["style", "hook", "case"],
    freshnessScore: typeof meta.freshnessScore === "number" ? meta.freshnessScore : 0.5,
    lastUsedAt: meta.lastUsedAt ?? null,
    manualNotes: meta.manualNotes ?? null,
  };

  const style = RuntimeStyleSummarySchema.safeParse(styleInput).success
    ? RuntimeStyleSummarySchema.parse(styleInput)
    : undefined;
  const writingBlocks = RuntimeWritingBlocksSchema.safeParse(writingBlocksInput).success
    ? RuntimeWritingBlocksSchema.parse(writingBlocksInput)
    : undefined;
  const caseBank = RuntimeCaseBankSchema.safeParse(caseBankInput).success
    ? RuntimeCaseBankSchema.parse(caseBankInput)
    : undefined;
  const applicability = ApplicabilityMetadataSchema.safeParse(applicabilityInput).success
    ? ApplicabilityMetadataSchema.parse(applicabilityInput)
    : undefined;

  return {
    style,
    writingBlocks,
    caseBank,
    applicability,
  };
}

export function flattenCaseBank(caseBank?: RuntimeCaseBank): RuntimeCaseCard[] {
  if (!caseBank) return [];
  return caseBank.cases;
}
