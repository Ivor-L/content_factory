import { View, Text, ScrollView, Image } from '@tarojs/components';
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro';
import { useEffect, useMemo, useRef, useState } from 'react';
import { miniappApi } from '../../utils/miniapp-api';
import type { StoryboardTaskStatusResult, StoryboardSegmentItem, WorkItem } from '../../utils/miniapp-api';
import './index.sass';

const WORK_RETENTION_DAYS = 5;
const RETENTION_MS = WORK_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const WORK_LIST_LIMIT = 40;
const WORKS_CACHE_KEY = 'WORKS_LIST_CACHE_V1';
const WORKS_CACHE_TTL_MS = 2 * 60 * 1000;

let memoryWorksCache: { items: WorkItem[]; updatedAt: number } | null = null;

export default function WorksPage() {
  const [works, setWorks] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const currentScrollTopRef = useRef(0);
  const shouldRestoreScrollRef = useRef(false);
  const restoreScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (restoreScrollTimerRef.current) {
        clearTimeout(restoreScrollTimerRef.current);
      }
    };
  }, []);

  const restoreScrollPosition = () => {
    const targetScrollTop = Math.max(0, currentScrollTopRef.current);
    if (targetScrollTop <= 0) return;

    if (restoreScrollTimerRef.current) {
      clearTimeout(restoreScrollTimerRef.current);
    }

    setScrollTop(Math.max(0, targetScrollTop - 1));
    restoreScrollTimerRef.current = setTimeout(() => {
      setScrollTop(targetScrollTop);
      restoreScrollTimerRef.current = null;
    }, 80);
  };

  const loadWorks = async (options?: { silent?: boolean; forceRefresh?: boolean }) => {
    const silent = options?.silent === true;
    const forceRefresh = options?.forceRefresh === true;
    if (!silent) {
      setLoading(true);
    }
    try {
      const data = await miniappApi.getWorkList(WORK_LIST_LIMIT, { forceRefresh });
      const { valid, expired } = splitValidWorks(data);
      setWorks(valid);
      writeWorksCache(valid);
      cleanupExpiredWorks(expired);
      void refreshRemixWorksStatusOnce(valid, forceRefresh);
    } catch (error) {
      if (!silent) {
        Taro.showToast({
          title: error instanceof Error ? error.message : '加载失败',
          icon: 'none',
        });
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
      if (shouldRestoreScrollRef.current) {
        shouldRestoreScrollRef.current = false;
        restoreScrollPosition();
      }
    }
  };

  useDidShow(() => {
    const cached = readWorksCache();
    if (cached.length > 0) {
      setWorks(cached);
      void loadWorks({ silent: true, forceRefresh: true });
      return;
    }
    void loadWorks({ forceRefresh: true });
  });

  usePullDownRefresh(() => {
    handleRefresh();
  });

  const handleRefresh = () => {
    if (refreshing || loading) return;
    setRefreshing(true);
    void loadWorks({ forceRefresh: true }).finally(() => {
      setRefreshing(false);
      try {
        Taro.stopPullDownRefresh();
      } catch {
        // noop
      }
    });
  };

  const filteredWorks = useMemo(() => {
    return sortWorksByCreatedAtDesc(works);
  }, [works]);
  const workColumns = useMemo(() => splitAlternatingColumns(filteredWorks), [filteredWorks]);

  const handleOpenDetail = (item: any) => {
    shouldRestoreScrollRef.current = true;
    setScrollTop(Math.max(0, currentScrollTopRef.current));

    const payload = {
      ...item,
      title: typeof item?.title === 'string' ? item.title : '未命名作品',
    };
    Taro.setStorageSync('WORK_DETAIL_ITEM', payload);
    const taskType = String(item?.taskType || '').toLowerCase();
    if (item?.source === 'task' && taskType === 'storyboard') {
      const storyboardTaskId = String(item?.taskId || item?.id || '').trim();
      const isRemix = isRemixWork(item);
      Taro.navigateTo({
        url: isRemix
          ? resolveRemixEntryUrl(item, storyboardTaskId, payload.title)
          : `/subpages/storyboard-board/index?id=${encodeURIComponent(storyboardTaskId)}&title=${encodeURIComponent(payload.title)}`,
      });
      return;
    }
    Taro.navigateTo({ url: `/subpages/work-detail/index?id=${encodeURIComponent(String(item?.id ?? ''))}` });
  };

  const handleScroll = (event: any) => {
    const nextScrollTop = Number(event?.detail?.scrollTop ?? 0);
    if (Number.isFinite(nextScrollTop)) {
      currentScrollTopRef.current = nextScrollTop;
    }
  };

  const refreshRemixWorksStatusOnce = async (items: WorkItem[], forceRefresh = false) => {
    const remixItems = items.filter((item) => {
      const taskId = String(item.taskId || item.id || '').trim();
      return isRemixWork(item) && String(item.taskType || '').toLowerCase() === 'storyboard' && Boolean(taskId);
    });
    if (remixItems.length === 0) return;

    const results = await Promise.allSettled(
      remixItems.map(async (item) => {
        const taskId = String(item.taskId || item.id || '').trim();
        const status = await miniappApi.getStoryboardStatus(taskId, { forceRefresh });
        return { key: getWorkKey(item), item: mergeRemixWorkStatus(item, status) };
      }),
    );

    const updatedByKey = new Map<string, WorkItem>();
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        updatedByKey.set(result.value.key, result.value.item);
      }
    });
    if (updatedByKey.size === 0) return;

    setWorks((prev) => {
      const next = prev.map((item) => updatedByKey.get(getWorkKey(item)) || item);
      writeWorksCache(next);
      return next;
    });
  };

  return (
    <View className='works-page'>
      <View className='works-header'>
        <View className='works-header-top'>
          <Text className='works-title'>我的作品</Text>
          <Text className={`works-refresh ${refreshing ? 'works-refresh--disabled' : ''}`} onClick={handleRefresh}>
            刷新
          </Text>
        </View>
        <View className='works-retention-banner'>
          <View className='works-retention-banner-dot' />
          <Text className='works-retention-banner-text'>作品保留 5 天，超期自动清理</Text>
        </View>
      </View>

      <ScrollView scrollY className='works-list' scrollTop={scrollTop} onScroll={handleScroll}>
        {loading && <Text className='works-helper'>加载中...</Text>}

        {!loading && (
          <View className='works-masonry'>
            {workColumns.map((column, columnIndex) => (
              <View key={`works-column-${columnIndex}`} className='works-column'>
                {column.map(({ item, index }) => {
                  const coverUrl = pickWorkCover(item);
                  const coverRatioClass = getCoverRatioClass(index, item.type);
                  const hasCover = Boolean(coverUrl);
                  const placeholderKind = getPlaceholderKind(item.type);
                  const posterPageCount = getPosterPageCount(item);
                  const isProcessing = isWorkProcessing(item);
                  const isRemix = isRemixWork(item);
                  const videoPreviewUrl = isRemix ? resolveRemixReferenceVideoUrl(item) : item.type === 'video' ? resolveWorkVideoUrl(item) : '';
                  const showVideoBadge = Boolean(videoPreviewUrl) || item.type === 'video';
                  const cardStatus = getWorkStatusLabel(item);
                  const isImageText = item.type === 'image-text';
                  const isCopy = item.type === 'copy';
                  const overlayStatusText = getWorkProcessingText(item);

                  return (
                    <View
                      key={`${item.type}-${item.id}`}
                      className={`works-card ${isProcessing ? 'works-card--processing' : ''} ${isRemix ? 'works-card--remix' : ''}`}
                      onClick={() => handleOpenDetail(item)}
                    >
                      <View className={`works-cover ${coverRatioClass}`}>
                        {hasCover ? (
                          <Image
                            className='works-cover-image'
                            src={coverUrl as string}
                            mode='aspectFill'
                          />
                        ) : (
                          <View className='works-cover-placeholder'>
                            {renderWorksPlaceholderIcon(placeholderKind)}
                          </View>
                        )}
                        {isRemix && (
                          <View className='works-remix-badge'>
                            <Text className='works-remix-badge-text'>智能复刻</Text>
                          </View>
                        )}
                        {showVideoBadge && (
                          <View className='works-video-icon'>
                            <Text className='works-video-icon-text'>▶</Text>
                          </View>
                        )}
                        {posterPageCount > 1 && (
                          <View className='works-pages-badge'>
                            <Text className='works-pages-badge-text'>{posterPageCount}页</Text>
                          </View>
                        )}
                        {isProcessing && (
                          <View className='works-processing-overlay'>
                            <View className='works-processing-spinner' />
                            <Text className='works-processing-text'>{overlayStatusText}</Text>
                          </View>
                        )}
                      </View>

                      <View className='works-card-body'>
                        <Text className={`works-card-title ${isImageText ? 'works-card-title--full' : ''}`}>{item.title}</Text>
                        {isRemix && (
                          <Text className='works-card-preview'>{getRemixStageText(item)}</Text>
                        )}
                        {item.taskType === 'digitalHuman' && item.preview && (
                          <Text className='works-card-preview'>{item.preview}</Text>
                        )}
                        {isCopy && item.preview && (
                          <Text className='works-card-preview'>{item.preview}</Text>
                        )}
                        <View className='works-card-bottom'>
                          {cardStatus && <Text className='works-card-status'>{cardStatus}</Text>}
                          <Text className='works-card-date'>{formatDate(item.createdAt)}</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        )}

        {!loading && filteredWorks.length === 0 && (
          <Text className='works-helper'>暂无作品，去创作第一条内容吧</Text>
        )}
      </ScrollView>
    </View>
  );
}

function pickWorkCover(item: any): string | null {
  const layoutCover = getPosterImages(item)[0];
  if (layoutCover) return layoutCover;

  const thumb = typeof item?.thumbnailUrl === 'string' ? item.thumbnailUrl.trim() : '';
  if (thumb && isImageUrl(thumb)) return thumb;

  const preview = typeof item?.preview === 'string' ? item.preview.trim() : '';
  if (preview && isImageUrl(preview)) {
    return preview;
  }

  return null;
}

function splitValidWorks(items: WorkItem[]) {
  const now = Date.now();
  const expired: WorkItem[] = [];
  const valid: WorkItem[] = [];

  for (const item of items) {
    const createdAtMs = new Date(item.createdAt).getTime();
    if (!Number.isFinite(createdAtMs) || now - createdAtMs <= RETENTION_MS) {
      valid.push(item);
      continue;
    }
    expired.push(item);
  }

  return { valid, expired };
}

function readWorksCache(): WorkItem[] {
  const now = Date.now();
  if (memoryWorksCache && now - memoryWorksCache.updatedAt <= WORKS_CACHE_TTL_MS) {
    return splitValidWorks(memoryWorksCache.items).valid;
  }

  try {
    const raw = Taro.getStorageSync(WORKS_CACHE_KEY);
    const parsed = raw ? JSON.parse(String(raw)) : null;
    const updatedAt = Number(parsed?.updatedAt || 0);
    const items = Array.isArray(parsed?.items) ? parsed.items as WorkItem[] : [];
    if (!updatedAt || now - updatedAt > WORKS_CACHE_TTL_MS || items.length === 0) return [];
    memoryWorksCache = { items, updatedAt };
    return splitValidWorks(items).valid;
  } catch {
    return [];
  }
}

function writeWorksCache(items: WorkItem[]) {
  const payload = { items, updatedAt: Date.now() };
  memoryWorksCache = payload;
  try {
    Taro.setStorageSync(WORKS_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Storage quota should not block the works page.
  }
}

function cleanupExpiredWorks(expired: WorkItem[]) {
  if (expired.length === 0) return;
  setTimeout(() => {
    void Promise.allSettled(expired.map((item) => miniappApi.deleteWorkItem(item)));
  }, 300);
}

function getWorkKey(item: WorkItem): string {
  return `${item.source}:${item.taskType || ''}:${item.taskId || item.id}`;
}

function isRemixVideoSegment(segment: StoryboardSegmentItem): boolean {
  const params = segment.generationParams || {};
  const status = String(segment.status || '').toUpperCase();
  return Boolean(params.clip_index || params.clipIndex || params.clip_video_prompt || params.clipVideoPrompt) ||
    Boolean(segment.generatedVideo) ||
    status === 'VIDEO_READY' ||
    status === 'VIDEO_GENERATING' ||
    status === 'VIDEO_QUEUED' ||
    status === 'VIDEO_PROCESSING' ||
    status === 'VIDEO_FAILED' ||
    status === 'VIDEO_BILLING_FAILED';
}

function pickRemixVideoSegments(segments: StoryboardSegmentItem[]): StoryboardSegmentItem[] {
  const videoSegments = segments.filter(isRemixVideoSegment);
  return videoSegments.length > 0 ? videoSegments : segments;
}

function mergeRemixWorkStatus(item: WorkItem, status: StoryboardTaskStatusResult): WorkItem {
  const previousMetadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
  const videoSegments = pickRemixVideoSegments(status.segments || []);
  const segmentCount = videoSegments.length;
  const generatedVideoCount = videoSegments.filter((segment) => Boolean(segment.generatedVideo)).length;
  const generatingVideoCount = videoSegments.filter((segment) => {
    const segmentStatus = String(segment.status || '').toUpperCase();
    return segmentStatus === 'VIDEO_GENERATING' || segmentStatus === 'VIDEO_QUEUED' || segmentStatus === 'VIDEO_PROCESSING';
  }).length;
  const finalVideoUrl = status.finalVideoUrl || '';
  const completedSegments = videoSegments.filter((segment) => {
    const segmentStatus = String(segment.status || '').toUpperCase();
    return segmentStatus === 'VIDEO_READY' || Boolean(segment.generatedVideo);
  }).length;
  const nextStatus = finalVideoUrl
    ? 'COMPLETED'
    : completedSegments > 0 && completedSegments >= Math.max(1, segmentCount)
      ? 'PENDING'
      : generatingVideoCount > 0 || String(status.status || '').toUpperCase().includes('GENERAT')
        ? 'GENERATING'
        : 'PENDING';

  return {
    ...item,
    status: nextStatus,
    rawStatus: status.status,
    progress: status.progress,
    thumbnailUrl: item.thumbnailUrl || status.coverImage || status.storyboardImageUrl || null,
    metadata: {
      ...previousMetadata,
      finalVideoUrl,
      segmentCount,
      generatedVideoCount,
      completedSegments,
      generatingVideoCount,
      storyboardImageUrl: status.storyboardImageUrl || previousMetadata.storyboardImageUrl,
      coverImage: status.coverImage || previousMetadata.coverImage,
    },
  };
}

function resolveWorkVideoUrl(item: any): string {
  const metadata = item?.metadata && typeof item.metadata === 'object'
    ? item.metadata as Record<string, unknown>
    : null;
  const candidates = [
    item?.videoUrl,
    item?.resultUrl,
    item?.outputUrl,
    metadata?.videoUrl,
    metadata?.resultUrl,
    metadata?.finalVideoUrl,
    metadata?.video_url,
    metadata?.result_url,
    metadata?.final_video_url,
  ];
  for (const candidate of candidates) {
    const url = typeof candidate === 'string' ? candidate.trim() : '';
    if (url) return url;
  }
  return '';
}

function resolveRemixReferenceVideoUrl(item: any): string {
  const metadata = item?.metadata && typeof item.metadata === 'object'
    ? item.metadata as Record<string, unknown>
    : null;
  const candidates = [
    metadata?.referenceVideoUrl,
    metadata?.reference_video_url,
    metadata?.videoUrl,
    metadata?.video_url,
    item?.videoUrl,
    item?.preview,
  ];
  for (const candidate of candidates) {
    const url = typeof candidate === 'string' ? candidate.trim() : '';
    if (url && /^https?:\/\//i.test(url)) return url;
  }
  return '';
}

function isRemixWork(item: any): boolean {
  const metadata = item?.metadata && typeof item.metadata === 'object'
    ? item.metadata as Record<string, unknown>
    : null;
  return item?.type === 'remix' || metadata?.feature === 'viral_remix';
}

function resolveRemixEntryUrl(item: any, storyboardTaskId: string, title: string): string {
  const metadata = item?.metadata && typeof item.metadata === 'object'
    ? item.metadata as Record<string, unknown>
    : null;
  const hasSegments = Boolean(metadata?.segment_count || metadata?.segmentCount);
  const status = getRawWorkStatus(item);
  const progress = Number(item?.progress ?? 0);
  const reachedVideoStage =
    hasSegments ||
    status.includes('IMAGE') ||
    status.includes('VIDEO') ||
    status.includes('MERGE') ||
    status.includes('COMPLETE') ||
    (Number.isFinite(progress) && progress >= 20);

  if (reachedVideoStage) {
    return `/subpages/remix-video-generate/index?id=${encodeURIComponent(storyboardTaskId)}&title=${encodeURIComponent(title)}`;
  }

  return `/subpages/storyboard-board/index?id=${encodeURIComponent(storyboardTaskId)}&title=${encodeURIComponent(title)}&mode=remix`;
}

function getRemixStageText(item: any): string {
  const metadata = item?.metadata && typeof item.metadata === 'object'
    ? item.metadata as Record<string, unknown>
    : null;
  const status = getRawWorkStatus(item);
  if (status.includes('FAIL') || status.includes('ERROR')) return '智能复刻失败，可点开查看当前任务状态';
  if (hasRemixFinalVideo(metadata, item)) return '智能复刻已完成，可查看成片与分镜资产';
  if (isRemixWaitingForMerge(metadata, status)) return '视频片段已生成，等待一键剪辑成片';
  if (isRemixVideoGenerating(metadata, status)) return '正在生成视频片段';
  const progress = Number(item?.progress ?? 0);
  if (Number.isFinite(progress) && progress >= 60) return '正在生成替换图或视频片段';
  if (Number.isFinite(progress) && progress >= 20) return '已完成爆款拆解，等待产品/角色替换';
  const strategy = String(metadata?.strategy || '').toUpperCase();
  return strategy === 'STORYBOARD' ? '正在生成智能复刻分镜板' : '正在拆解参考视频';
}

function getWorkStatusLabel(item: any): string {
  if (isRemixWork(item)) return getRemixStatusLabel(item);
  const status = String(item?.status || '').toUpperCase();
  if (status.includes('FAIL') || status.includes('ERROR')) return '失败';
  if (status.includes('COMPLETE') || status === 'DONE' || status === 'SUCCESS') return '已完成';
  if (isCopyWork(item) && isWorkProcessing(item)) return '撰写中';
  return isWorkProcessing(item) ? '生成中' : '';
}

function getWorkProcessingText(item: any): string {
  if (isRemixWork(item)) return getRemixProcessingText(item);
  if (isCopyWork(item)) return '撰写中';
  return '生成中';
}

function getRawWorkStatus(item: any): string {
  return String(item?.rawStatus || item?.status || '').toUpperCase();
}

function hasRemixFinalVideo(metadata: Record<string, unknown> | null, item: any): boolean {
  const candidates = [
    metadata?.finalVideoUrl,
    metadata?.final_video_url,
    item?.finalVideoUrl,
  ];
  return candidates.some((value) => typeof value === 'string' && value.trim().length > 0);
}

function hasGeneratedRemixVideos(metadata: Record<string, unknown> | null): boolean {
  const generatedVideoCount = Number(metadata?.generatedVideoCount ?? 0);
  const segmentCount = Number(metadata?.segmentCount ?? 0);
  return Number.isFinite(generatedVideoCount) && generatedVideoCount > 0 &&
    (!Number.isFinite(segmentCount) || segmentCount <= 0 || generatedVideoCount >= segmentCount);
}

function isRemixWaitingForMerge(metadata: Record<string, unknown> | null, rawStatus: string): boolean {
  return hasGeneratedRemixVideos(metadata) ||
    rawStatus.includes('VIDEO_GENERATION_COMPLETED') ||
    rawStatus.includes('VIDEO_READY') ||
    rawStatus.includes('MERGE');
}

function isRemixVideoGenerating(metadata: Record<string, unknown> | null, rawStatus: string): boolean {
  const generatingVideoCount = Number(metadata?.generatingVideoCount ?? 0);
  return rawStatus.includes('VIDEO_GENERAT') ||
    rawStatus.includes('VIDEO_PROCESS') ||
    rawStatus.includes('VIDEO_QUEUE') ||
    (Number.isFinite(generatingVideoCount) && generatingVideoCount > 0);
}

function getRemixStatusLabel(item: any): string {
  const metadata = item?.metadata && typeof item.metadata === 'object'
    ? item.metadata as Record<string, unknown>
    : null;
  const status = getRawWorkStatus(item);
  if (status.includes('FAIL') || status.includes('ERROR')) return '失败';
  if (hasRemixFinalVideo(metadata, item)) return '已完成';
  if (isRemixWaitingForMerge(metadata, status)) return '待剪辑';
  if (String(item?.status || '').toUpperCase() === 'GENERATING' || isRemixVideoGenerating(metadata, status)) return '生成中';
  return '待继续';
}

function getRemixProcessingText(item: any): string {
  const metadata = item?.metadata && typeof item.metadata === 'object'
    ? item.metadata as Record<string, unknown>
    : null;
  const status = getRawWorkStatus(item);
  if (isRemixVideoGenerating(metadata, status)) return '视频生成中';
  return '复刻中';
}

function isCopyWork(item: any): boolean {
  const taskType = String(item?.taskType || '').toLowerCase();
  return item?.type === 'copy' || taskType === 'creative' || taskType.includes('copy') || taskType.includes('writing');
}

function getPosterImages(item: any): string[] {
  const metadata = item?.metadata && typeof item.metadata === 'object'
    ? item.metadata as Record<string, unknown>
    : null;
  const custom = metadata?.custom && typeof metadata.custom === 'object'
    ? metadata.custom as Record<string, unknown>
    : null;
  const layout = metadata?.xhsLayout && typeof metadata.xhsLayout === 'object'
    ? metadata.xhsLayout as Record<string, unknown>
    : null;
  const canvasImage = metadata?.canvasImage && typeof metadata.canvasImage === 'object'
    ? metadata.canvasImage as Record<string, unknown>
    : null;

  const candidates = [
    layout?.images,
    canvasImage?.images,
    canvasImage?.generatedImages,
    canvasImage?.generated_images,
    metadata?.images,
    metadata?.imageUrls,
    metadata?.image_urls,
    metadata?.generatedImages,
    metadata?.generated_images,
    metadata?.generatedImagesJson,
    metadata?.generated_images_json,
    custom?.xhsLayout,
    custom?.images,
    custom?.imageUrls,
    custom?.image_urls,
    custom?.generatedImages,
    custom?.generated_images,
    item?.images,
    item?.imageUrls,
    item?.image_urls,
    item?.generatedImages,
    item?.generated_images,
    item?.generatedImagesJson,
    item?.generated_images_json,
  ];

  const urls = candidates.flatMap((candidate) => collectImageUrls(candidate));
  return Array.from(new Set(urls));
}

function collectImageUrls(value: unknown, depth = 0): string[] {
  if (depth > 5 || value == null) return [];

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return collectImageUrls(JSON.parse(trimmed), depth + 1);
      } catch {
        return isImageUrl(trimmed) ? [trimmed] : [];
      }
    }
    return isImageUrl(trimmed) ? [trimmed] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectImageUrls(entry, depth + 1));
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const preferred = [
      obj.url,
      obj.imageUrl,
      obj.image_url,
      obj.src,
      obj.publicUrl,
      obj.public_url,
      obj.fileUrl,
      obj.file_url,
      obj.thumbnailUrl,
      obj.thumbnail_url,
      obj.coverUrl,
      obj.cover_url,
    ].flatMap((entry) => collectImageUrls(entry, depth + 1));
    if (preferred.length > 0) return preferred;
    return Object.values(obj).flatMap((entry) => collectImageUrls(entry, depth + 1));
  }

  return [];
}

function isImageUrl(value: string) {
  if (!/^https?:\/\//i.test(value)) return false;
  return !/\.(mp4|mov|m3u8)(\?|$)|\/video\/|\/master\/|xgvideo/i.test(value);
}

function getPosterPageCount(item: any): number {
  if (item?.type !== 'image-text') return 0;
  return getPosterImages(item).length;
}

function getCoverRatioClass(index: number, type: string) {
  if (type === 'remix') return 'works-cover--ratio-4x5';
  if (type === 'video') return 'works-cover--ratio-4x5';
  if (index % 3 === 0) return 'works-cover--ratio-1x1';
  if (index % 3 === 1) return 'works-cover--ratio-4x5';
  return 'works-cover--ratio-3x4';
}

function sortWorksByCreatedAtDesc(items: any[]) {
  return items.slice().sort((a, b) => getCreatedAtTime(b) - getCreatedAtTime(a));
}

function getCreatedAtTime(item: any) {
  const time = new Date(String(item?.createdAt || '')).getTime();
  return Number.isFinite(time) ? time : 0;
}

function isWorkProcessing(item: any) {
  if (isRemixWork(item)) return getRemixStatusLabel(item) === '生成中';
  const status = String(item?.status || '').toUpperCase();
  return (
    status.includes('GENERAT') ||
    status.includes('PROCESS') ||
    status.includes('PEND') ||
    status.includes('QUEUE') ||
    status.includes('WAIT') ||
    status.includes('RUNNING') ||
    status.includes('START') ||
    status === 'ACTIVE' ||
    status === 'CREATED' ||
    status === 'CREATE' ||
    status === 'INIT' ||
    status === 'INITIALIZED'
  );
}

function splitAlternatingColumns<T>(items: T[]) {
  return items.reduce<Array<Array<{ item: T; index: number }>>>(
    (columns, item, index) => {
      columns[index % 2].push({ item, index });
      return columns;
    },
    [[], []],
  );
}

type PlaceholderKind = 'video' | 'image' | 'copy' | 'remix';

function getPlaceholderKind(type?: string): PlaceholderKind {
  if (type === 'remix') return 'remix';
  if (type === 'video') return 'video';
  if (type === 'image-text') return 'image';
  return 'copy';
}

function renderWorksPlaceholderIcon(kind: PlaceholderKind) {
  if (kind === 'remix') {
    return (
      <View className='works-placeholder-icon works-placeholder-icon--remix'>
        <Text className='works-placeholder-remix-text'>AI</Text>
      </View>
    );
  }

  if (kind === 'video') {
    return (
      <View className='works-placeholder-icon'>
        <View className='works-placeholder-video-triangle' />
      </View>
    );
  }

  if (kind === 'image') {
    return (
      <View className='works-placeholder-icon'>
        <View className='works-placeholder-image-dot' />
        <View className='works-placeholder-image-mountain' />
      </View>
    );
  }

  return (
    <View className='works-placeholder-icon'>
      <View className='works-placeholder-doc' />
      <View className='works-placeholder-doc-line works-placeholder-doc-line--top' />
      <View className='works-placeholder-doc-line works-placeholder-doc-line--mid' />
      <View className='works-placeholder-doc-line works-placeholder-doc-line--bottom' />
      <View className='works-placeholder-pen' />
    </View>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';

  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${month}/${day} ${hour}:${minute}`;
}
