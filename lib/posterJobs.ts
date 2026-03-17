import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import type { StylePreset, XhsPosterImage, XhsPosterJob } from "@prisma/client";
import prisma from "./prisma";
import { generateXhsImages, type MinimalStyle } from "./xhsImageGenerator";
import { uploadToStorage } from "./storageUpload";
import { getAssetBucket, posterImagePath } from "./storagePaths";
import { removeAssetFiles } from "./storageRemove";
import { DEFAULT_POSTER_COUNT } from "./posterConfig";

export type PosterJobDTO = {
  id: string;
  title?: string;
  copyText: string;
  status: "pending" | "ready" | "error";
  error?: string;
  createdAt: string;
  variationCount: number;
  sourceTaskId?: string;
  style: {
    id: string;
    name: string | null;
  };
  images: Array<{
    id: string;
    imageUrl: string;
    prompt?: string;
  }>;
};

export function serializePosterJob(job: XhsPosterJob & { images: XhsPosterImage[] }): PosterJobDTO {
  return {
    id: job.id,
    title: job.title ?? undefined,
    copyText: job.copyText,
    status: (job.status as PosterJobDTO["status"]) ?? "pending",
    error: job.error ?? undefined,
    createdAt: job.createdAt.toISOString(),
    variationCount: typeof job.variationCount === "number" ? job.variationCount : DEFAULT_POSTER_COUNT,
    sourceTaskId: job.sourceTaskId ?? undefined,
    style: {
      id: job.styleId,
      name: job.styleName ?? null,
    },
    images: job.images
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((image) => ({
        id: image.id,
        imageUrl: image.imageUrl,
        prompt: image.prompt ?? undefined,
      })),
  };
}

function stripDataPrefix(dataUrl: string) {
  const match = /^data:(.*?);base64,(.*)$/i.exec(dataUrl);
  if (!match) {
    return { mimeType: "image/png", base64: dataUrl };
  }
  return {
    mimeType: match[1] || "image/png",
    base64: match[2],
  };
}

type PosterGenerationParams = {
  job: XhsPosterJob;
  style: MinimalStyle;
  copyText: string;
  title?: string;
  variations?: number;
};

export async function runPosterGeneration({
  job,
  style,
  copyText,
  title,
  variations,
}: PosterGenerationParams) {
  const posters = await generateXhsImages({
    style,
    copyText,
    title,
    variations,
  });

  const uploaded = await Promise.all(
    posters.map(async (poster, index) => {
      const { mimeType, base64 } = stripDataPrefix(poster.imageUrl);
      const buffer = Buffer.from(base64, "base64");
      const extension = mimeType.includes("jpeg") ? "jpg" : "png";
      const path = posterImagePath(job.userId, job.id, `poster-${index + 1}.${extension}`);
      const imageId = randomUUID();
      const uploadResult = await uploadToStorage({
        bucket: getAssetBucket(),
        path,
        body: buffer,
        contentType: mimeType,
        upsert: true,
      });
      return {
        id: imageId,
        path: uploadResult.path,
        url: uploadResult.publicUrl,
        prompt: poster.prompt,
        sortOrder: index,
      };
    })
  );

  await prisma.xhsPosterImage.createMany({
    data: uploaded.map((item) => ({
      id: item.id,
      jobId: job.id,
      imageUrl: item.url,
      storagePath: item.path,
      prompt: item.prompt,
      sortOrder: item.sortOrder,
    })),
  });

  const updatedJob = await prisma.xhsPosterJob.update({
    where: { id: job.id },
    data: { status: "ready", error: null },
    include: { images: { orderBy: { sortOrder: "asc" } } },
  });

  return serializePosterJob(updatedJob);
}

export async function markPosterJobFailed(jobId: string, error: string) {
  const failed = await prisma.xhsPosterJob.update({
    where: { id: jobId },
    data: { status: "error", error },
    include: { images: { orderBy: { sortOrder: "asc" } } },
  });
  return serializePosterJob(failed);
}

export async function clearPosterImages(images: XhsPosterImage[]) {
  if (!images.length) return;
  await prisma.xhsPosterImage.deleteMany({
    where: { id: { in: images.map((img) => img.id) } },
  });
  await removeAssetFiles(images.map((img) => img.storagePath));
}

export function buildStyleFallback(
  job: XhsPosterJob,
  snapshot?: Record<string, any> | null,
  fallback?: StylePreset | null
): MinimalStyle {
  if (fallback) return fallback;
  const snapshotRecord = snapshot && typeof snapshot === "object" ? snapshot : {};
  return {
    id: job.styleId,
    name: job.styleName ?? job.styleId,
    type: snapshotRecord.type ?? "xhs-visual",
    description: snapshotRecord.description ?? null,
    spec: snapshotRecord.spec ?? {},
    metadata: snapshotRecord.metadata ?? {},
  } as MinimalStyle;
}
