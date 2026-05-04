import { Buffer } from "node:buffer";
import path from "node:path";
import sharp from "sharp";
import { getAssetBucket, stylePreviewThumbnailPath } from "@/lib/storagePaths";
import { uploadToStorage } from "@/lib/storageUpload";

const THUMBNAIL_WIDTH = 480;
const THUMBNAIL_HEIGHT = 600;
const THUMBNAIL_QUALITY = 76;

type StylePreviewThumbnailInput = {
  userId: string;
  source: Buffer;
  originalFilename: string;
  contentType?: string | null;
};

type StylePreviewThumbnailResult = {
  publicUrl: string;
  storagePath: string;
  width: number;
  height: number;
  size: number;
  contentType: string;
};

const isSupportedImage = (contentType?: string | null) => {
  if (!contentType) return true;
  const normalized = contentType.toLowerCase();
  return normalized.startsWith("image/") && normalized !== "image/svg+xml";
};

const buildThumbnailFilename = (filename: string) => {
  const parsed = path.parse(filename || "style-preview");
  return `${parsed.name || "style-preview"}-thumb.webp`;
};

export async function createStylePreviewThumbnail({
  userId,
  source,
  originalFilename,
  contentType,
}: StylePreviewThumbnailInput): Promise<StylePreviewThumbnailResult | null> {
  if (!source.length || !isSupportedImage(contentType)) {
    return null;
  }

  const output = await sharp(source)
    .rotate()
    .resize({
      width: THUMBNAIL_WIDTH,
      height: THUMBNAIL_HEIGHT,
      fit: "cover",
      position: "attention",
      withoutEnlargement: true,
    })
    .webp({ quality: THUMBNAIL_QUALITY, effort: 4 })
    .toBuffer();

  const upload = await uploadToStorage({
    bucket: getAssetBucket(),
    path: stylePreviewThumbnailPath(userId, buildThumbnailFilename(originalFilename)),
    body: output,
    contentType: "image/webp",
  });

  return {
    publicUrl: upload.publicUrl,
    storagePath: upload.path,
    width: THUMBNAIL_WIDTH,
    height: THUMBNAIL_HEIGHT,
    size: output.length,
    contentType: "image/webp",
  };
}
