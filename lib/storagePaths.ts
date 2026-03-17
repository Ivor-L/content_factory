const DEFAULT_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET ?? "uploads";

type AssetKind = "history" | "stories" | "styles";

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
}

function sanitizeOwner(userId?: string | null) {
  if (!userId) return "anonymous";
  return sanitizeFilename(userId);
}

function composePath(kind: AssetKind, userId: string | null | undefined, filename: string) {
  const safeUser = sanitizeOwner(userId);
  const safeFilename = sanitizeFilename(filename);
  return `${kind}/${safeUser}/${Date.now()}-${safeFilename}`;
}

function composeDerivedPath(kind: AssetKind, userId: string | null | undefined, filename: string) {
  const safeUser = sanitizeOwner(userId);
  const safeFilename = sanitizeFilename(filename);
  return `${kind}/${safeUser}/derived/${safeFilename}`;
}

export function historyAssetPath(userId: string, filename: string) {
  return composePath("history", userId, filename);
}

export function storyAssetPath(userId: string, filename: string) {
  return composePath("stories", userId, filename);
}

export function stylePreviewPath(userId: string, filename: string) {
  return composePath("styles", userId, filename);
}

export function historyInsightsPath(userId: string | null | undefined, historyDocId: string) {
  return composeDerivedPath("history", userId, `${historyDocId}-insights.json`);
}

export function historyRuntimePath(
  userId: string | null | undefined,
  historyDocId: string,
  objectName: "style" | "blocks" | "cases" | "applicability",
) {
  return composeDerivedPath("history", userId, `${historyDocId}-runtime-${objectName}.json`);
}

export function storyStructurePath(userId: string | null | undefined, storyId: string) {
  return composeDerivedPath("stories", userId, `${storyId}-structure.json`);
}

export function styleAnalysisPath(userId: string | null | undefined, styleId: string) {
  return composeDerivedPath("styles", userId, `${styleId}-analysis.json`);
}

export function getAssetBucket() {
  return DEFAULT_BUCKET;
}

export function posterImagePath(userId: string, jobId: string, filename: string) {
  const safeUser = sanitizeOwner(userId);
  const safeJob = sanitizeFilename(jobId);
  const safeFilename = sanitizeFilename(filename);
  return `posters/${safeUser}/${safeJob}/${safeFilename}`;
}
