import { View, Text, Image, Swiper, SwiperItem, ScrollView } from '@tarojs/components';
import Taro, { useLoad, useDidShow, useUnload } from '@tarojs/taro';
import { useEffect, useMemo, useRef, useState } from 'react';
import { miniappApi, type MyNoteTaskDetail } from '../../utils/miniapp-api';
import { getFavoriteIdSet, toggleFavoriteFromHot } from '../../utils/favorites';
import './index.sass';

const HOT_COVER_FALLBACK_URL = 'https://oss.atomx.top/miniapp/hot-square/fallback-cover-1777628403821.jpg';
const POLL_MS = 2500;

function formatLikes(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) return '--';
  if (value > 10000) return `${(value / 10000).toFixed(1)}万`;
  return String(Math.round(value));
}

function formatMyTaskStatus(status: string) {
  const key = String(status || '').toUpperCase();
  if (key.includes('BREAKDOWN_PENDING') || key.includes('PENDING') || key.includes('PROCESS')) return '解析中';
  if (key.includes('BREAKDOWN_COMPLETED')) return '解析完成';
  if (key.includes('REWRITE_PENDING')) return '仿写中';
  if (key.includes('REWRITE_COMPLETED')) return '仿写完成';
  if (key.includes('FAILED') || key.includes('ERROR')) return '失败';
  return key || '--';
}

export default function HotDetailPage() {
  const [mode, setMode] = useState<'hot' | 'my'>('hot');
  const [myTaskId, setMyTaskId] = useState('');
  const [loadError, setLoadError] = useState('');

  const [item, setItem] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [favorited, setFavorited] = useState(false);

  const [myTask, setMyTask] = useState<MyNoteTaskDetail | null>(null);
  const [loadingMyTask, setLoadingMyTask] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const pollTimerRef = useRef<number | null>(null);

  const clearPoll = () => {
    if (pollTimerRef.current != null) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const loadMyTask = async (taskId: string, silent = false) => {
    if (!taskId) return;
    if (!silent) setLoadingMyTask(true);
    try {
      const detail = await miniappApi.getImageTextMyNoteTask(taskId);
      setMyTask(detail);
    } catch (error) {
      if (!silent) {
        Taro.showToast({
          title: error instanceof Error ? error.message : '加载失败',
          icon: 'none',
        });
      }
    } finally {
      if (!silent) setLoadingMyTask(false);
    }
  };

  const startPollingMyTask = (taskId: string) => {
    clearPoll();
    pollTimerRef.current = setInterval(() => {
      void (async () => {
        try {
          const detail = await miniappApi.getImageTextMyNoteTask(taskId);
          setMyTask(detail);
          const status = String(detail.status || '').toUpperCase();
          const isTerminal = status.includes('BREAKDOWN_COMPLETED') || status.includes('REWRITE_COMPLETED') || status.includes('FAILED') || status.includes('ERROR');
          if (isTerminal && !status.includes('PENDING') && !status.includes('PROCESS')) {
            clearPoll();
          }
        } catch {
          // keep polling
        }
      })();
    }, POLL_MS) as unknown as number;
  };

  useLoad((query) => {
    const nextMode = query?.mode === 'my' || query?.myTaskId ? 'my' : 'hot';
    setMode(nextMode);
    setLoadError('');

    if (nextMode === 'my') {
      const taskId = String(query?.myTaskId || '').trim();
      setMyTaskId(taskId);
      if (taskId) {
        void loadMyTask(taskId);
        startPollingMyTask(taskId);
      }
      return;
    }

    const cached = Taro.getStorageSync('HOT_DETAIL_ITEM');
    if (cached && (!query?.id || String(cached.id) === String(query.id))) {
      setItem(cached);
      setFavorited(getFavoriteIdSet().has(String(cached.id)));
      return;
    }

    setLoadError('详情数据已失效，请返回爆款列表重新进入');
  });

  useDidShow(() => {
    if (mode === 'my' && myTaskId) {
      void loadMyTask(myTaskId, true);
      if (!pollTimerRef.current) startPollingMyTask(myTaskId);
    }
  });

  useUnload(() => {
    clearPoll();
  });

  useEffect(() => {
    return () => {
      clearPoll();
    };
  }, []);

  const coverUrl = useMemo(() => {
    const raw = typeof item?.coverUrl === 'string' ? item.coverUrl.trim() : '';
    return raw || HOT_COVER_FALLBACK_URL;
  }, [item]);

  const detailImages = useMemo(() => {
    const list = Array.isArray(item?.mediaUrls)
      ? item.mediaUrls
          .map((url: unknown) => (typeof url === 'string' ? url.trim() : ''))
          .filter((url: string) => Boolean(url))
      : [];
    if (list.length > 0) return list;
    return [coverUrl];
  }, [coverUrl, item?.mediaUrls]);

  const myImages = useMemo(() => {
    if (!myTask) return [] as string[];
    if (Array.isArray(myTask.analysisResult?.sourceImages) && myTask.analysisResult.sourceImages.length > 0) {
      return myTask.analysisResult.sourceImages;
    }
    return myTask.source?.images || [];
  }, [myTask]);

  useEffect(() => {
    if (currentSlide > detailImages.length - 1) {
      setCurrentSlide(0);
    }
  }, [currentSlide, detailImages.length]);

  const handleBack = () => {
    clearPoll();
    Taro.navigateBack({ delta: 1 });
  };

  const handleOneClickCreate = async () => {
    if (!item || creating) return;
    setCreating(true);
    try {
      const result = await miniappApi.startOneClickCreate(item);
      Taro.showToast({ title: '已加入我的，后台解析中', icon: 'none' });
      console.log('one click create note task:', result.taskId, result.status);
      setTimeout(() => {
        const pages = Taro.getCurrentPages();
        const useRedirect = pages.length >= 9;
        const nav = useRedirect ? Taro.redirectTo : Taro.navigateTo;
        nav({
          url: `/subpages/hot-detail/index?myTaskId=${encodeURIComponent(result.taskId)}&mode=my`,
          fail: (error) => {
            console.error('[hot-detail] jump my note failed', error);
            Taro.showToast({ title: '跳转失败，请重试', icon: 'none' });
          },
        });
      }, 500);
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '创建失败',
        icon: 'none',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleToggleFavorite = () => {
    if (!item) return;
    const result = toggleFavoriteFromHot(item);
    setFavorited(result.favorited);
    Taro.showToast({
      title: result.favorited ? '已收藏' : '已取消收藏',
      icon: 'none',
    });
  };

  const handleRewrite = async () => {
    if (!myTaskId || rewriting) return;
    setRewriting(true);
    try {
      const result = await miniappApi.triggerImageTextMyNoteRewrite(myTaskId);
      await loadMyTask(myTaskId, true);
      Taro.showToast({ title: '仿写完成，已添加到作品', icon: 'success' });
      const latest = await miniappApi.getImageTextMyNoteTask(myTaskId);
      const rewrite = latest.analysisResult.rewriteResult;
      if (rewrite) {
        Taro.setStorageSync('MY_NOTE_REWRITE_PAYLOAD', {
          targetFeature: 'card-layout',
          title: rewrite.title,
          body: rewrite.body,
          imageTexts: rewrite.imageTexts,
        });
      }
      setTimeout(() => {
        const pages = Taro.getCurrentPages();
        const useRedirect = pages.length >= 9;
        const nav = useRedirect ? Taro.redirectTo : Taro.navigateTo;
        nav({
          url: `/subpages/work-detail/index?id=${encodeURIComponent(result.workTaskId)}`,
          fail: (error) => {
            console.error('[hot-detail] jump work detail failed', error);
            Taro.showToast({ title: '跳转失败，请重试', icon: 'none' });
          },
        });
      }, 550);
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '仿写失败',
        icon: 'none',
      });
    } finally {
      setRewriting(false);
    }
  };

  if (mode === 'my') {
    const extractedTexts = myTask?.analysisResult?.extractedImageTexts || [];
    const rewrite = myTask?.analysisResult?.rewriteResult || null;
    const statusLabel = formatMyTaskStatus(myTask?.status || '');
    const canRewrite = Boolean(myTask && String(myTask.status || '').toUpperCase().includes('BREAKDOWN_COMPLETED'));
    const canRouteToCards = Boolean(rewrite);

    const handleRouteToCardLayout = () => {
      if (!rewrite) return;
      Taro.setStorageSync('MY_NOTE_REWRITE_PAYLOAD', {
        targetFeature: 'card-layout',
        title: rewrite.title,
        body: rewrite.body,
        imageTexts: rewrite.imageTexts,
      });
      Taro.navigateTo({ url: '/subpages/image-generate/index' });
    };

    const handleRouteToInfographic = () => {
      if (!rewrite) return;
      Taro.setStorageSync('MY_NOTE_REWRITE_PAYLOAD', {
        targetFeature: 'infographic',
        title: rewrite.title,
        body: rewrite.body,
        imageTexts: rewrite.imageTexts,
      });
      Taro.navigateTo({ url: '/subpages/image-generate/index' });
    };

    return (
      <View className='hot-detail-page'>
        <View className='hot-detail-nav'>
          <View className='hot-detail-back' onClick={handleBack}>
            <Text className='hot-detail-back-text'>返回</Text>
          </View>
          <Text className='hot-detail-nav-title'>我的笔记</Text>
          <View className='hot-detail-nav-spacer' />
        </View>

        <View className='hot-detail-content'>
          {!myTask && loadingMyTask ? (
            <View className='hot-detail-empty'>
              <Text className='hot-detail-empty-text'>加载中...</Text>
            </View>
          ) : !myTask ? (
            <View className='hot-detail-empty'>
              <Text className='hot-detail-empty-text'>未找到笔记任务</Text>
            </View>
          ) : (
            <ScrollView scrollY className='hot-my-scroll'>
              <View className='hot-detail-card'>
                {myImages.length > 1 ? (
                  <View className='hot-detail-swiper-wrap'>
                    <Swiper
                      className='hot-detail-swiper'
                      indicatorDots={false}
                      circular={false}
                      current={currentSlide}
                      onChange={(e) => setCurrentSlide(e.detail.current)}
                    >
                      {myImages.map((url, index) => (
                        <SwiperItem key={`${url}-${index}`}>
                          <Image className='hot-detail-cover' src={url} mode='aspectFill' />
                        </SwiperItem>
                      ))}
                    </Swiper>
                    <View className='hot-detail-swiper-indicator'>
                      <Text className='hot-detail-swiper-indicator-text'>{currentSlide + 1}/{myImages.length}</Text>
                    </View>
                  </View>
                ) : (
                  <Image className='hot-detail-cover' src={myImages[0] || HOT_COVER_FALLBACK_URL} mode='widthFix' />
                )}

                <View className='hot-detail-body'>
                  <Text className='hot-detail-title'>{myTask.source.title || '未命名笔记'}</Text>
                  <View className='hot-detail-meta'>
                    <Text className='hot-detail-author'>状态：{statusLabel}</Text>
                    <Text className='hot-detail-collects'>{extractedTexts.length} 条文案</Text>
                  </View>
                  {!!myTask.source.text && (
                    <Text className='hot-detail-desc'>原正文：{myTask.source.text}</Text>
                  )}

                  <View className='hot-my-section'>
                    <Text className='hot-my-section-title'>图片文案提取</Text>
                    {extractedTexts.length === 0 ? (
                      <Text className='hot-my-empty'>解析中，支持关闭页面后台继续运行</Text>
                    ) : (
                      extractedTexts.map((item) => (
                        <View key={`${item.index}`} className='hot-my-item'>
                          <Text className='hot-my-item-title'>图 {item.index}</Text>
                          <Text className='hot-my-item-text'>{item.text || '[空]'}</Text>
                        </View>
                      ))
                    )}
                  </View>

                  {!!rewrite && (
                    <View className='hot-my-section'>
                      <Text className='hot-my-section-title'>仿写结果</Text>
                      <Text className='hot-my-item-title'>标题</Text>
                      <Text className='hot-my-item-text'>{rewrite.title || '--'}</Text>
                      <Text className='hot-my-item-title'>正文</Text>
                      <Text className='hot-my-item-text'>{rewrite.body || '--'}</Text>
                    </View>
                  )}
                </View>
              </View>
            </ScrollView>
          )}
        </View>

        {!!myTask && (
          <View className='hot-detail-action-bar hot-detail-action-bar--my'>
            {canRouteToCards && (
              <>
                <View className='hot-detail-fav-btn hot-detail-action-btn' onClick={handleRouteToInfographic}>
                  <Text className='hot-detail-fav-btn-text'>生成信息卡片</Text>
                </View>
                <View className='hot-detail-fav-btn hot-detail-action-btn' onClick={handleRouteToCardLayout}>
                  <Text className='hot-detail-fav-btn-text'>生成图文卡片</Text>
                </View>
              </>
            )}
            <View
              className={`hot-detail-create-btn hot-detail-action-btn ${!canRewrite || rewriting ? 'hot-detail-create-btn--disabled' : ''}`}
              onClick={!canRewrite || rewriting ? undefined : handleRewrite}
            >
              <Text className='hot-detail-create-btn-text'>
                {rewriting ? '仿写中...' : (canRewrite ? '一键仿写' : '等待解析完成')}
              </Text>
            </View>
          </View>
        )}
      </View>
    );
  }

  return (
    <View className='hot-detail-page'>
      <View className='hot-detail-nav'>
        <View className='hot-detail-back' onClick={handleBack}>
          <Text className='hot-detail-back-text'>返回</Text>
        </View>
        <Text className='hot-detail-nav-title'>爆款详情</Text>
        <View className='hot-detail-nav-spacer' />
      </View>

      {!item ? (
        <View className='hot-detail-empty'>
          <Text className='hot-detail-empty-text'>{loadError || '未找到内容，请返回重试'}</Text>
        </View>
      ) : (
        <View className='hot-detail-content'>
          <View className='hot-detail-card'>
            {detailImages.length > 1 ? (
              <View className='hot-detail-swiper-wrap'>
                <Swiper
                  className='hot-detail-swiper'
                  indicatorDots={false}
                  circular={false}
                  current={currentSlide}
                  onChange={(e) => setCurrentSlide(e.detail.current)}
                >
                  {detailImages.map((url, index) => (
                    <SwiperItem key={`${url}-${index}`}>
                      <Image className='hot-detail-cover' src={url} mode='aspectFill' />
                    </SwiperItem>
                  ))}
                </Swiper>
                <View className='hot-detail-swiper-indicator'>
                  <Text className='hot-detail-swiper-indicator-text'>{currentSlide + 1}/{detailImages.length}</Text>
                </View>
              </View>
            ) : (
              <Image className='hot-detail-cover' src={coverUrl} mode='widthFix' />
            )}
            <View className='hot-detail-body'>
              <Text className='hot-detail-title'>{item.title || '未命名内容'}</Text>
              <View className='hot-detail-meta'>
                <Text className='hot-detail-author'>{item.creatorName || '匿名作者'}</Text>
                <Text className='hot-detail-collects'>♡ {formatLikes(item.likes)}</Text>
              </View>
              {!!item.description && (
                <Text className='hot-detail-desc'>{item.description}</Text>
              )}
            </View>
          </View>
          <View className='hot-detail-action-bar'>
            <View
              className={`hot-detail-fav-btn hot-detail-action-btn ${favorited ? 'hot-detail-fav-btn--active' : ''}`}
              onClick={handleToggleFavorite}
            >
              <Text className={`hot-detail-fav-btn-text ${favorited ? 'hot-detail-fav-btn-text--active' : ''}`}>
                {favorited ? '已收藏' : '收藏'}
              </Text>
            </View>
            <View
              className={`hot-detail-create-btn hot-detail-action-btn ${creating ? 'hot-detail-create-btn--disabled' : ''}`}
              onClick={handleOneClickCreate}
            >
              <Text className='hot-detail-create-btn-text'>{creating ? '创建中...' : '一键同款创作'}</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
