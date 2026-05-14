import { View, Text, ScrollView, Image } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useState } from 'react';
import { api } from '../../utils/api';
import { addUploadedFavorite, getFavorites, removeFavorite } from '../../utils/favorites';
import { useMiniappShare } from '../../utils/miniapp-share';
import './index.sass';

const COVER_FALLBACK_URL = 'https://oss.atomx.top/miniapp/hot-square/fallback-cover-1777628403821.jpg';

export default function FavoritesPage() {
  useMiniappShare();

  const [list, setList] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);

  useDidShow(() => {
    setList(getFavorites());
  });

  const handleUploadVideo = async () => {
    if (uploading) return;
    try {
      setUploading(true);
      const choose = await Taro.chooseVideo({
        sourceType: ['album', 'camera'],
        compressed: true,
        maxDuration: 60,
      });
      if (!choose?.tempFilePath) return;

      const extMatch = choose.tempFilePath.match(/\.(\w+)(\?|$)/);
      const ext = extMatch?.[1]?.toLowerCase() || 'mp4';
      const mimeType = ext === 'mov' ? 'video/quicktime' : `video/${ext === 'mp4' ? 'mp4' : 'mpeg'}`;
      const videoUrl = await api.uploadMedia(choose.tempFilePath, `favorite-video-${Date.now()}.${ext}`, mimeType);

      const next = addUploadedFavorite({
        title: choose?.size ? `我上传的视频 (${Math.round(choose.size / 1024 / 1024)}MB)` : '我上传的视频',
        videoUrl,
        coverUrl: null,
        description: '手动上传到收藏',
      });
      setList(getFavorites());
      Taro.showToast({ title: `已加入收藏：${next.title}`, icon: 'none' });
    } catch {
      Taro.showToast({ title: '上传失败，请重试', icon: 'none' });
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = (id: string, e: any) => {
    e?.stopPropagation?.();
    const next = removeFavorite(id);
    setList(next);
    Taro.showToast({ title: '已移除', icon: 'none' });
  };

  const handleOpen = (item: any) => {
    if (item?.videoUrl) {
      const detailItem = {
        id: item.id,
        title: item.title || '收藏内容',
        type: 'video',
        status: 'COMPLETED',
        createdAt: new Date(item.collectedAt || Date.now()).toISOString(),
        preview: item.videoUrl,
        videoUrl: item.videoUrl,
        thumbnailUrl: item.coverUrl || null,
        metadata: { videoUrl: item.videoUrl },
        source: 'task',
      };
      Taro.setStorageSync('WORK_DETAIL_ITEM', detailItem);
      Taro.navigateTo({
        url: `/subpages/work-detail/index?id=${encodeURIComponent(String(detailItem.id || 'favorite'))}`,
      });
      return;
    }
    Taro.showToast({ title: '该收藏暂无可预览视频', icon: 'none' });
  };

  return (
    <View className='favorites-page'>
      <View className='favorites-header'>
        <Text className='favorites-title'>我的收藏</Text>
      </View>

      <ScrollView scrollY className='favorites-list'>
        <View className='favorites-grid'>
          {list.map((item) => (
            <View key={String(item.id)} className='favorites-card' onClick={() => handleOpen(item)}>
              <View className='favorites-cover'>
                <Image className='favorites-cover-image' src={item.coverUrl || COVER_FALLBACK_URL} mode='aspectFill' />
                <View className='favorites-video-icon'>
                  <Text className='favorites-video-icon-text'>▶</Text>
                </View>
              </View>

              <View className='favorites-body'>
                <Text className='favorites-item-title'>{item.title || '未命名内容'}</Text>
                <View className='favorites-row'>
                  <Text className='favorites-tag'>{item.source === 'upload' ? '手动上传' : '爆款收藏'}</Text>
                  <View className='favorites-remove-btn' onClick={(e) => handleRemove(String(item.id), e)}>
                    <Text className='favorites-remove-btn-text'>移除</Text>
                  </View>
                </View>
              </View>
            </View>
          ))}
        </View>

        {list.length === 0 && (
          <View className='favorites-empty'>
            <View className='favorites-empty-icon'>
              <Text className='favorites-empty-icon-text'>☆</Text>
            </View>
            <Text className='favorites-empty-text'>暂无收藏，去爆款页收藏或上传视频</Text>
          </View>
        )}
      </ScrollView>

      <View
        className={`favorites-fab ${uploading ? 'favorites-fab--disabled' : ''}`}
        onClick={handleUploadVideo}
      >
        <Text className='favorites-fab-text'>{uploading ? '…' : '+'}</Text>
      </View>
    </View>
  );
}
