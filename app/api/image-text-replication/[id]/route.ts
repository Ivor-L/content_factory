import { NextRequest, NextResponse } from "next/server";
import { getRequestUserContext } from "@/lib/authServer";
import prisma from "@/lib/prisma";

function parseObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function collectObjects(value: unknown): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = [];
  const queue: unknown[] = [value];
  const seen = new Set<unknown>();

  while (queue.length > 0 && result.length < 160) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    const obj = current as Record<string, unknown>;
    result.push(obj);
    queue.push(...Object.values(obj));
  }

  return result;
}

function mapStatus(raw: string): string {
  if (raw === "PROCESSING") return "GENERATE_PENDING";
  if (raw === "FAILED") return "GENERATE_FAILED";
  return raw;
}

function normalizeGeneratedImages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const urls: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim()) {
      urls.push(item);
      continue;
    }
    const obj = parseObject(item);
    if (!obj) continue;
    const url = obj.url;
    if (typeof url === "string" && url.trim()) {
      urls.push(url);
    }
  }
  return urls;
}

function normalizeImageGuidance(value: unknown): Array<{ index: number; description: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, idx) => {
      const obj = parseObject(item);
      if (!obj) return null;
      const description = typeof obj.description === "string" ? obj.description : "";
      if (!description) return null;
      const index = Number(obj.index);
      return {
        index: Number.isFinite(index) && index > 0 ? Math.floor(index) : idx + 1,
        description,
      };
    })
    .filter((item): item is { index: number; description: string } => Boolean(item));
}

function normalizeMyNoteAnalysis(value: unknown) {
  const data = parseObject(value) ?? {};
  const rawTexts = Array.isArray(data.extractedImageTexts) ? data.extractedImageTexts : [];
  const extractedImageTexts = rawTexts
    .map((item, index) => {
      const obj = parseObject(item);
      if (!obj) return null;
      const text = typeof obj.text === 'string' ? obj.text : '';
      const success = Boolean(obj.success);
      const error = typeof obj.error === 'string' ? obj.error : null;
      const idx = Number(obj.index);
      return {
        index: Number.isFinite(idx) && idx > 0 ? Math.floor(idx) : index + 1,
        text,
        success,
        error,
      };
    })
    .filter(Boolean);

  const rewrite = parseObject(data.rewriteResult);
  const titleFormula = parseObject(rewrite?.titleFormula);
  const mapTitleFormulaCandidate = (item: unknown) => {
    const obj = parseObject(item);
    if (!obj) return null;
    const title = typeof obj.title === 'string' ? obj.title : '';
    const formulaId = Number(obj.formulaId);
    if (!title || !Number.isInteger(formulaId)) return null;
    return {
      title,
      formulaId,
      triggerType: typeof obj.triggerType === 'string' ? obj.triggerType : '',
      formulaTemplate: typeof obj.formulaTemplate === 'string' ? obj.formulaTemplate : '',
      originalExample: typeof obj.originalExample === 'string' ? obj.originalExample : '',
      reason: typeof obj.reason === 'string' ? obj.reason : '',
    };
  };
  const rewriteResult = rewrite
    ? {
        title: typeof rewrite.title === 'string' ? rewrite.title : '',
        body: typeof rewrite.body === 'string' ? rewrite.body : '',
        imageTexts: Array.isArray(rewrite.imageTexts)
          ? rewrite.imageTexts.map((item) => String(item || '').trim()).filter(Boolean)
          : [],
        titleFormula: titleFormula
          ? {
              topic: typeof titleFormula.topic === 'string' ? titleFormula.topic : '',
              industry: typeof titleFormula.industry === 'string' ? titleFormula.industry : '',
              candidates: Array.isArray(titleFormula.candidates)
                ? titleFormula.candidates.map(mapTitleFormulaCandidate).filter(Boolean)
                : [],
              top3: Array.isArray(titleFormula.top3)
                ? titleFormula.top3.map(mapTitleFormulaCandidate).filter(Boolean)
                : [],
            }
          : null,
      }
    : null;

  return {
    sourceTitle: typeof data.sourceTitle === 'string' ? data.sourceTitle : '',
    sourceText: typeof data.sourceText === 'string' ? data.sourceText : '',
    sourceImages: Array.isArray(data.sourceImages)
      ? data.sourceImages.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
    extractedImageTexts,
    rewriteResult,
  };
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function pickNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
    if (typeof value === "string") {
      const normalized = value.replace(/,/g, "").replace(/\+/g, "").trim();
      if (!normalized) continue;
      const match = normalized.match(/([\d.]+)/);
      if (!match) continue;
      let multiplier = 1;
      if (/[万w]/i.test(normalized)) multiplier = 10000;
      else if (/[千k]/i.test(normalized)) multiplier = 1000;
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed)) return Math.round(parsed * multiplier);
    }
  }
  return null;
}

function pickStringByKeys(objects: Record<string, unknown>[], keys: string[]): string | null {
  for (const obj of objects) {
    for (const key of keys) {
      const value = pickString(obj[key]);
      if (value) return value;
    }
  }
  return null;
}

function pickNumberByKeys(objects: Record<string, unknown>[], keys: string[]): number | null {
  for (const obj of objects) {
    for (const key of keys) {
      const value = pickNumber(obj[key]);
      if (value != null) return value;
    }
  }
  return null;
}

function pickStringByPath(raw: Record<string, unknown>, path: string): string | null {
  const value = path.split(".").reduce<unknown>((current, key) => {
    const obj = parseObject(current);
    return obj ? obj[key] : undefined;
  }, raw);
  return pickString(value);
}

function normalizeMyNoteRaw(value: unknown) {
  const raw = parseObject(value) ?? {};
  const author = parseObject(raw.author) ?? {};
  const stats = parseObject(raw.stats) ?? {};
  const objects = collectObjects(raw);
  const authorNameKeys = ["作者昵称", "作者名称", "用户昵称", "用户名称", "博主昵称", "博主", "作者", "nickname", "nickName", "nick_name", "authorName", "author_name", "userName", "username", "name"];
  const avatarKeys = ["作者头像", "用户头像", "博主头像", "头像", "avatar", "avatarUrl", "avatar_url", "authorAvatar", "author_avatar", "userAvatar", "user_avatar", "image"];
  return {
    creatorName: pickString(raw.creatorName, raw.authorName, raw.author_name, raw["作者昵称"], raw["作者名称"], raw["用户昵称"], raw["用户名称"], raw["博主昵称"], raw["博主"], raw["作者"], author.name, author.nickname, author.nickName, author.username) ?? pickStringByKeys(objects, authorNameKeys),
    creatorAvatarUrl: pickString(raw.creatorAvatarUrl, raw.authorAvatar, raw.author_avatar, raw["作者头像"], raw["用户头像"], raw["博主头像"], raw["头像"], author.avatarUrl, author.avatar_url, author.avatar) ?? pickStringByKeys(objects, avatarKeys),
    likes: pickNumber(stats.likes, stats.likeCount, stats.like_count, stats.liked_count, raw.likes, raw.likeCount, raw.like_count, raw.liked_count, raw["点赞数"], raw["点赞"], raw["赞数"]) ?? pickNumberByKeys(objects, ["点赞数", "点赞", "赞数", "liked_count", "like_count", "likeCount", "likedCount", "likes"]),
    collects: pickNumber(stats.collects, stats.collectCount, stats.collect_count, stats.collected_count, raw.collects, raw.collectCount, raw.collect_count, raw.collected_count, raw["收藏数"], raw["收藏"]) ?? pickNumberByKeys(objects, ["收藏数", "收藏", "collected_count", "collect_count", "collectCount", "collectedCount", "collects"]),
    comments: pickNumber(stats.comments, stats.commentCount, stats.comment_count, raw.comments, raw.commentCount, raw.comment_count, raw["评论数"], raw["评论"]) ?? pickNumberByKeys(objects, ["评论数", "评论", "comment_count", "commentCount", "comments"]),
    shares: pickNumber(stats.shares, stats.shareCount, stats.share_count, raw.shares, raw.shareCount, raw.share_count, raw["分享数"], raw["分享"]) ?? pickNumberByKeys(objects, ["分享数", "分享", "share_count", "shareCount", "shares"]),
    videoUrl: pickStringByPath(raw, "media.videoUrl") ?? pickStringByKeys(objects, ["videoUrl", "video_url", "视频地址", "视频链接", "播放地址", "playUrl", "play_url", "masterUrl", "master_url"]),
    sourceType: pickStringByPath(raw, "media.sourceType") ?? pickString(raw.sourceType, raw.source_type),
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const task = await prisma.creativeTask.findFirst({
    where: { id, userId },
    include: {
      styles: {
        include: {
          style: {
            select: { id: true, name: true, type: true, previewUrl: true, spec: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (task) {
    const metadata = parseObject(task.metadata) ?? {};
    const custom = parseObject(metadata.custom) ?? {};
    const replication = parseObject(custom.replication) ?? {};
    const style = task.styles[0]?.style ?? null;

    return NextResponse.json({
      task: {
        id: task.id,
        status: mapStatus(task.status),
        analysisResult: task.layoutResultJson ?? replication.analysisResult ?? null,
        generatedCopy:
          (typeof replication.generatedCopy === "string" && replication.generatedCopy) ||
          task.ideaText ||
          null,
        generatedImages: normalizeGeneratedImages(task.generatedImagesJson),
        imageGuidance: normalizeImageGuidance(replication.imageGuidance),
        errorMessage: task.errorMessage ?? null,
        stylePreset: style
          ? {
              id: style.id,
              name: style.name,
              type: style.type,
              previewUrl: style.previewUrl,
              spec: style.spec,
            }
          : null,
      },
    });
  }

  const myNote = await prisma.imageTextReplicationTask.findFirst({
    where: { id, userId },
  });

  if (!myNote) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const rawMeta = normalizeMyNoteRaw(myNote.generatedImages);

  return NextResponse.json({
    task: {
      id: myNote.id,
      status: mapStatus(myNote.status),
      generatedCopy: myNote.generatedCopy || null,
      generatedImages: normalizeGeneratedImages(myNote.generatedImages),
      imageGuidance: normalizeImageGuidance(myNote.imageGuidance),
      errorMessage: myNote.errorMessage ?? null,
      analysisResult: normalizeMyNoteAnalysis(myNote.analysisResult),
      source: {
        title: myNote.sourceTitle || '',
        text: myNote.sourceText || '',
        images: Array.isArray(myNote.sourceImages)
          ? myNote.sourceImages.map((item) => String(item || '').trim()).filter(Boolean)
          : [],
        platform: myNote.sourcePlatform || '',
        sourceId: myNote.sourceId || '',
        sourceUrl: myNote.sourceUrl || '',
        creatorName: rawMeta.creatorName,
        creatorAvatarUrl: rawMeta.creatorAvatarUrl,
        likes: rawMeta.likes,
        collects: rawMeta.collects,
        comments: rawMeta.comments,
        shares: rawMeta.shares,
        videoUrl: rawMeta.videoUrl,
        sourceType: rawMeta.sourceType || (rawMeta.videoUrl ? 'video' : 'image'),
      },
      stylePreset: null,
    },
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const result = await prisma.imageTextReplicationTask.deleteMany({
    where: { id, userId },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, deleted: result.count });
}
