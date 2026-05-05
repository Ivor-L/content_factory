import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import prisma from '@/lib/prisma';
import { getAssetBucket } from '@/lib/storagePaths';
import { uploadToStorage } from '@/lib/storageUpload';
import { toInputJson } from '@/lib/jsonUtils';
import {
  buildRenderSvgs,
  buildRenderTitle,
  normalizeTemplateId,
  type CardTemplateId,
} from '@/lib/xhsLayoutEngine';

export type XhsCardLayoutInput = {
  markdown?: string;
  templateId?: string;
  styleKey?: string;
  title?: string;
  includeCover?: boolean;
  maxPages?: number;
  persist?: boolean;
  cover?: {
    coverStyleId?: string;
    coverTitle?: string;
    coverSubtitle?: string;
    coverImage?: string;
    coverTextColor?: string;
    coverHighlightColor?: string;
    coverCardRadius?: number;
    coverShowStickers?: boolean;
    coverFontFamily?: string;
    coverTitleAlignX?: 'left' | 'center' | 'right';
    coverTitleAlignY?: 'top' | 'center' | 'bottom';
    coverFontSize?: number;
    coverSubtitleFontSize?: number;
    coverLineHeight?: number;
  };
};

export type XhsCardLayoutResult = {
  taskId: string;
  title: string;
  templateId: CardTemplateId;
  images: string[];
};

function sanitizeText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\r\n/g, '\n').trim().slice(0, maxLength);
}

function sanitizeTitle(value: unknown): string {
  if (typeof value !== 'string') return '';
  return Array.from(value.replace(/\r\n/g, ' ').trim()).slice(0, 28).join('');
}

function normalizeMaxPages(raw: unknown): number {
  if (typeof raw !== 'number' || Number.isNaN(raw)) return 8;
  const rounded = Math.round(raw);
  return Math.min(Math.max(rounded, 1), 12);
}

function pickPreview(markdown: string): string {
  const cleaned = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, 140);
}

function buildMetadata(input: {
  templateId: CardTemplateId;
  markdown: string;
  imageUrls: string[];
  publishTitle: string;
}): Record<string, unknown> {
  return {
    posterMode: 'text2image',
    source: 'agent_xhs_layout',
    engine: 'web-template',
    xhsLayout: {
      templateId: input.templateId,
      markdown: input.markdown,
      images: input.imageUrls,
      title: input.publishTitle,
    },
  };
}

async function svgToPngBuffer(svg: string): Promise<Buffer> {
  const png = await sharp(Buffer.from(svg, 'utf8'))
    .png({ quality: 100 })
    .toBuffer();
  const stats = await sharp(png).stats();
  const opaqueChannels = stats.channels.filter((channel) => channel.max > 0);
  if (png.length < 1024 || opaqueChannels.length === 0) {
    throw new Error('blank_png_rendered');
  }
  return png;
}

export async function renderXhsCardLayout(input: {
  userId: string;
  accessToken?: string | null;
  body: XhsCardLayoutInput;
}): Promise<XhsCardLayoutResult> {
  const markdown = sanitizeText(input.body.markdown, 24000);
  if (!markdown) {
    throw new Error('markdown is required');
  }

  const templateId = normalizeTemplateId(input.body.templateId || input.body.styleKey);
  const requestedTitle = sanitizeTitle(input.body.title);
  const renderTitle = requestedTitle || buildRenderTitle(markdown, '图文卡片');
  const includeCover = input.body.includeCover !== false;
  const maxPages = normalizeMaxPages(input.body.maxPages);
  const renderId = randomUUID();
  const shouldPersist = input.body.persist === true;

  const svgs = buildRenderSvgs({
    markdown,
    templateId,
    title: renderTitle,
    includeCover,
    maxPages,
    cover: input.body.cover,
  });

  if (svgs.length === 0) {
    throw new Error('template render failed');
  }

  const pngs: Buffer[] = [];
  for (const svg of svgs) {
    pngs.push(await svgToPngBuffer(svg));
  }

  const folder = `xhs-layout/${input.userId}/${renderId}`;
  const bucket = getAssetBucket();
  const uploadedUrls: string[] = [];

  for (let i = 0; i < pngs.length; i += 1) {
    const storagePath = `${folder}/page-${String(i + 1).padStart(2, '0')}.png`;
    const uploadResult = await uploadToStorage({
      bucket,
      path: storagePath,
      body: pngs[i],
      contentType: 'image/png',
      accessToken: input.accessToken,
    });
    uploadedUrls.push(uploadResult.publicUrl);
  }

  const metadata = buildMetadata({
    templateId,
    markdown,
    imageUrls: uploadedUrls,
    publishTitle: renderTitle,
  });

  if (shouldPersist) {
    await prisma.$transaction(async (tx) => {
      await tx.creativeTask.create({
        data: {
          id: renderId,
          userId: input.userId,
          title: renderTitle,
          channel: 'xhs',
          targetOutput: 'poster',
          ideaText: markdown,
          status: 'COMPLETED',
          progress: 100,
          generatedImagesJson: toInputJson(uploadedUrls) ?? undefined,
          metadata: toInputJson({ custom: metadata }) ?? undefined,
        },
      });

      await tx.taskSummary.upsert({
        where: { taskType_taskId: { taskType: 'poster', taskId: renderId } },
        create: {
          userId: input.userId,
          taskType: 'poster',
          taskId: renderId,
          title: renderTitle,
          status: 'COMPLETED',
          preview: pickPreview(markdown),
          thumbnailUrl: uploadedUrls[0] || null,
          progress: 100,
          metadata: toInputJson(metadata) ?? undefined,
        },
        update: {
          title: renderTitle,
          status: 'COMPLETED',
          preview: pickPreview(markdown),
          thumbnailUrl: uploadedUrls[0] || null,
          progress: 100,
          metadata: toInputJson(metadata) ?? undefined,
          updatedAt: new Date(),
        },
      });
    });
  }

  return {
    taskId: shouldPersist ? renderId : '',
    title: renderTitle,
    templateId,
    images: uploadedUrls,
  };
}
