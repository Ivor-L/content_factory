import { View, Text, Image, Swiper, SwiperItem } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { useEffect, useMemo, useState } from 'react';
import { miniappApi } from '../../utils/miniapp-api';
import { getFavoriteIdSet, toggleFavoriteFromHot } from '../../utils/favorites';
import './index.sass';

const HOT_COVER_FALLBACK_URL = 'https://oss.atomx.top/miniapp/hot-square/fallback-cover-1777628403821.jpg';

export default function HotDetailPage() {
  const [item, setItem] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [favorited, setFavorited] = useState(false);

  useLoad((query) => {
    const cached = Taro.getStorageSync('HOT_DETAIL_ITEM');
    if (cached && (!query?.id || String(cached.id) === String(query.id))) {
      setItem(cached);
      setFavorited(getFavoriteIdSet().has(String(cached.id)));
    }
  });

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

  useEffect(() => {
    if (currentSlide > detailImages.length - 1) {
      setCurrentSlide(0);
    }
  }, [currentSlide, detailImages.length]);

  const formatLikes = (value?: number | null) => {
    if (typeof value !== 'number' || Number.isNaN(value) || value < 0) return '--';
    if (value > 10000) return `${(value / 10000).toFixed(1)}万`;
    return String(Math.round(value));
  };

  const handleBack = () => {
    Taro.navigateBack({ delta: 1 });
  };

  const handleOneClickCreate = async () => {
    if (!item || creating) return;
    setCreating(true);
    try {
      const result = await miniappApi.startOneClickCreate(item);
      Taro.showToast({ title: '已创建任务', icon: 'success' });
      console.log('one click create task:', result.taskId, result.status);
      setTimeout(() => {
        Taro.switchTab({ url: '/pages/works/index' });
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
          <Text className='hot-detail-empty-text'>未找到内容，请返回重试</Text>
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
