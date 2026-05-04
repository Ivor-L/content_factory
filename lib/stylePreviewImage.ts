type StylePreviewLike = {
  previewUrl?: string | null;
  thumbnailUrl?: string | null;
  metadata?: unknown;
};

const readMetadataThumbnailUrl = (metadata: unknown) => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>).thumbnailUrl;
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

export function getStylePreviewImageUrl(style: StylePreviewLike) {
  return style.thumbnailUrl || readMetadataThumbnailUrl(style.metadata) || style.previewUrl || null;
}
