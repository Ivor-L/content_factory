import { View, Text, ScrollView, Image } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useMemo, useState } from 'react';
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
    }
  };

  useDidShow(() => {
    void loadWorks();
  });

  const filteredWorks = useMemo(() => {
    const base = activeTab === 'all'
      ? works
      : works.filter((item) => item.type === activeTab);

    const hasDemo = base.some((item) => String(item?.id || '') === DEMO_STORYBOARD_TASK_ID);
    if (hasDemo || activeTab !== 'all') return base;
    return [buildDemoStoryboardCard(), ...base];
  }, [works, activeTab]);

  const handleOpenDetail = (item: any) => {
    const payload = {
      ...item,
      title: typeof item?.title === 'string' ? item.title : '未命名作品',
    };
    Taro.setStorageSync('WORK_DETAIL_ITEM', payload);
    const taskType = String(item?.taskType || '').toLowerCase();
    if (item?.source === 'task' && taskType === 'storyboard') {
      const isDemo = Boolean((item?.metadata as Record<string, unknown> | null)?.isDemoStoryboard);
      Taro.navigateTo({
        url: `/subpages/storyboard-board/index?id=${encodeURIComponent(String(item?.id ?? ''))}&title=${encodeURIComponent(payload.title)}${isDemo ? '&demo=1' : ''}`,
      });
      return;
    }
    Taro.navigateTo({ url: `/subpages/work-detail/index?id=${encodeURIComponent(String(item?.id ?? ''))}` });
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

      <ScrollView scrollY className='works-list'>
        {loading && <Text className='works-helper'>加载中...</Text>}

        {!loading && (
          <View className='works-masonry'>
            {filteredWorks.map((item, index) => {
              const coverUrl = pickWorkCover(item);
              const coverRatioClass = getCoverRatioClass(index, item.type);
              const hasCover = Boolean(coverUrl);
              const placeholderKind = getPlaceholderKind(item.type);
              const posterPageCount = getPosterPageCount(item);

              return (
                <View
                  key={`${item.type}-${item.id}`}
                  className='works-card'
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
                  </View>

                  <View className='works-card-body'>
                    <Text className='works-card-title'>{item.title}</Text>
                    <View className='works-card-bottom'>
                      <Text className='works-card-date'>{formatDate(item.createdAt)}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
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

function getPosterImages(item: any): string[] {
  const metadata = item?.metadata;
  if (!metadata || typeof metadata !== 'object') return [];
  const layout = (metadata as Record<string, unknown>).xhsLayout;
  if (!layout || typeof layout !== 'object') return [];
  const images = (layout as Record<string, unknown>).images;
  if (!Array.isArray(images)) return [];
  return images
    .map((it) => (typeof it === 'string' ? it.trim() : ''))
    .filter(Boolean);
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
