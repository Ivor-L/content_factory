import { View, Text, ScrollView, Image, Video } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useEffect, useMemo, useRef, useState } from 'react';
import { miniappApi } from '../../utils/miniapp-api';
import type { WorkItem } from '../../utils/miniapp-api';
import './index.sass';

const TABS = [
  { id: 'all', label: '全部' },
  { id: 'image-text', label: '图文' },
  { id: 'video', label: '视频' },
  { id: 'copy', label: '文案' },
];

const WORK_RETENTION_DAYS = 5;
const RETENTION_MS = WORK_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const DEMO_STORYBOARD_TASK_ID = 'demo-skeleton-storyboard';

function buildDemoStoryboardCard(): WorkItem {
  return {
    id: DEMO_STORYBOARD_TASK_ID,
    title: '演示：3D骨骼分镜板',
    type: 'task',
    taskType: 'storyboard',
    status: 'COMPLETED',
    createdAt: new Date().toISOString(),
    preview: '用于测试分镜板展示效果的演示任务卡片',
    thumbnailUrl: null,
    metadata: {
      isDemoStoryboard: true,
    },
    source: 'task',
  };
}

export default function WorksPage() {
  const [activeTab, setActiveTab] = useState('all');
  const [works, setWorks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
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

  const loadWorks = async () => {
    setLoading(true);
    try {
      const data = await miniappApi.getWorkList(60);
      const now = Date.now();
      const expired: WorkItem[] = [];
      const valid: WorkItem[] = [];

      for (const item of data) {
        const createdAtMs = new Date(item.createdAt).getTime();
        if (!Number.isFinite(createdAtMs) || now - createdAtMs <= RETENTION_MS) {
          valid.push(item);
          continue;
        }
        expired.push(item);
      }

      if (expired.length > 0) {
        const settled = await Promise.allSettled(expired.map((item) => miniappApi.deleteWorkItem(item)));
        const deletedCount = settled.filter((result) => result.status === 'fulfilled').length;
        if (deletedCount > 0) {
          Taro.showToast({
            title: `已清理 ${deletedCount} 条超期作品`,
            icon: 'none',
          });
        }
      }

      setWorks(valid);
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '加载失败',
        icon: 'none',
      });
    } finally {
      setLoading(false);
      if (shouldRestoreScrollRef.current) {
        shouldRestoreScrollRef.current = false;
        restoreScrollPosition();
      }
    }
  };

  useDidShow(() => {
    void loadWorks();
  });

  const filteredWorks = useMemo(() => {
    const base = activeTab === 'all'
      ? works
      : works.filter((item) => item.type === activeTab);

    const sorted = sortWorksByCreatedAtDesc(base);
    const hasDemo = sorted.some((item) => String(item?.id || '') === DEMO_STORYBOARD_TASK_ID);
    if (hasDemo || activeTab !== 'all') return sorted;
    return sortWorksByCreatedAtDesc([...sorted, buildDemoStoryboardCard()]);
  }, [works, activeTab]);
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
      const isDemo = Boolean((item?.metadata as Record<string, unknown> | null)?.isDemoStoryboard);
      const storyboardTaskId = String(item?.taskId || item?.id || '').trim();
      Taro.navigateTo({
        url: `/subpages/storyboard-board/index?id=${encodeURIComponent(storyboardTaskId)}&title=${encodeURIComponent(payload.title)}${isDemo ? '&demo=1' : ''}`,
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

  return (
    <View className='works-page'>
      <View className='works-header'>
        <Text className='works-title'>我的作品</Text>
        <View className='works-retention-banner'>
          <View className='works-retention-banner-dot' />
          <Text className='works-retention-banner-text'>作品保留 5 天，超期自动清理</Text>
        </View>
        <View className='works-tabs'>
          {TABS.map((tab) => (
            <View
              key={tab.id}
              className={`works-tab ${activeTab === tab.id ? 'works-tab--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Text className={`works-tab-text ${activeTab === tab.id ? 'works-tab-text--active' : ''}`}>{tab.label}</Text>
            </View>
          ))}
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
                  const videoPreviewUrl = item.type === 'video' ? resolveWorkVideoUrl(item) : '';

                  return (
                    <View
                      key={`${item.type}-${item.id}`}
                      className={`works-card ${isProcessing ? 'works-card--processing' : ''}`}
                      onClick={() => handleOpenDetail(item)}
                    >
                      <View className={`works-cover ${coverRatioClass}`}>
                        {videoPreviewUrl && !isProcessing ? (
                          <Video
                            className='works-cover-video'
                            src={videoPreviewUrl}
                            poster={coverUrl || undefined}
                            controls={false}
                            autoplay={false}
                            muted
                            showCenterPlayBtn={false}
                            showFullscreenBtn={false}
                            objectFit='cover'
                          />
                        ) : hasCover ? (
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
                        {item.type === 'video' && (
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
                            <Text className='works-processing-text'>生成中</Text>
                          </View>
                        )}
                      </View>

                      <View className='works-card-body'>
                        <Text className='works-card-title'>{item.title}</Text>
                        {item.taskType === 'digitalHuman' && item.preview && (
                          <Text className='works-card-preview'>{item.preview}</Text>
                        )}
                        <View className='works-card-bottom'>
                          {isProcessing && <Text className='works-card-status'>生成中</Text>}
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
  if (thumb) return thumb;

  const preview = typeof item?.preview === 'string' ? item.preview.trim() : '';
  if (preview && /\.(jpg|jpeg|png|webp)(\?|$)/i.test(preview)) {
    return preview;
  }

  return null;
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

  const candidates = [
    layout?.images,
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
  const status = String(item?.status || '').toUpperCase();
  return (
    status.includes('GENERAT') ||
    status.includes('PROCESS') ||
    status.includes('PEND') ||
    status.includes('QUEUE') ||
    status.includes('WAIT') ||
    status.includes('RUNNING') ||
    status.includes('START')
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

type PlaceholderKind = 'video' | 'image' | 'copy';

function getPlaceholderKind(type?: string): PlaceholderKind {
  if (type === 'video') return 'video';
  if (type === 'image-text') return 'image';
  return 'copy';
}

function renderWorksPlaceholderIcon(kind: PlaceholderKind) {
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
