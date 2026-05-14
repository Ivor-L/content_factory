import { View, Text, Image, ScrollView } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { useState } from 'react';
import { api } from '../../utils/api';
import { useMiniappShare } from '../../utils/miniapp-share';
import './index.sass';

const STATUS_LABELS: Record<string, string> = {
  GENERATING: '生成中',
  COMPLETED: '已完成',
  FAILED: '失败',
  PENDING: '排队中',
};

const STATUS_COLORS: Record<string, string> = {
  GENERATING: '#f5a623',
  COMPLETED: '#4caf50',
  FAILED: '#f44336',
  PENDING: '#888',
};

const VIDEO_EXT_RE = /\.(mp4|mov|m3u8)(\?|$)|\/video\/|\/master\/|xgvideo/i;
const IMAGE_EXT_RE = /\.(jpg|jpeg|png|webp|gif)(\?|$)/i;

export default function RecordsPage() {
  useMiniappShare();

  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const data = await api.getRecords();
      setRecords(data);
      setError(null);
    } catch {
      setError('加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  useLoad(() => { void fetchRecords(); });

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '--';
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const getRecordTypeLabel = (record: any) => {
    if (record?.type === 'ACTION_TRANSFER') return '动作复刻';
    const sourceType = String(record?.sourceType || 'IMAGE').toUpperCase();
    const modeLabel = record?.type === 'VOICE_CLONE' ? '文字驱动' : '音频驱动';
    return `${sourceType === 'VIDEO' ? '视频数字人' : '图片数字人'} · ${modeLabel}`;
  };

  const getRecordVideoUrl = (record: any) => {
    const candidates = [
      record?.resultUrl,
      record?.videoUrl,
      record?.preview,
      record?.metadata?.videoUrl,
      record?.metadata?.resultUrl,
      record?.metadata?.outputUrl,
    ];
    const found = candidates.find((item) => typeof item === 'string' && VIDEO_EXT_RE.test(item));
    return typeof found === 'string' ? found.trim() : '';
  };

  const getRecordCoverUrl = (record: any) => {
    const candidates = [
      record?.thumbnailUrl,
      record?.imageUrl,
      record?.coverImage,
      record?.preview,
      record?.metadata?.thumbnailUrl,
      record?.metadata?.imageUrl,
      record?.metadata?.coverImage,
    ];
    const found = candidates.find((item) => typeof item === 'string' && IMAGE_EXT_RE.test(item));
    return typeof found === 'string' ? found.trim() : '';
  };

  const handleBack = () => {
    const pages = Taro.getCurrentPages();
    if (pages.length > 1) {
      Taro.navigateBack({ delta: 1 });
      return;
    }
    Taro.switchTab({ url: '/pages/home/index' });
  };

  const handleOpenRecord = (record: any) => {
    const videoUrl = getRecordVideoUrl(record);
    const coverUrl = getRecordCoverUrl(record);
    if (!videoUrl && !coverUrl) {
      Taro.showToast({ title: '暂无可预览内容', icon: 'none' });
      return;
    }
    const detailItem = {
      id: String(record?.id || `record-${Date.now()}`),
      title: getRecordTypeLabel(record),
      type: videoUrl ? 'video' : 'image',
      status: record?.status || '',
      createdAt: record?.createdAt || record?.updatedAt || new Date().toISOString(),
      preview: videoUrl || coverUrl,
      videoUrl: videoUrl || null,
      thumbnailUrl: coverUrl || null,
      metadata: {
        ...(record?.metadata && typeof record.metadata === 'object' ? record.metadata : {}),
        videoUrl: videoUrl || null,
        imageUrl: coverUrl || null,
      },
      source: 'task',
    };
    Taro.setStorageSync('WORK_DETAIL_ITEM', detailItem);
    Taro.navigateTo({ url: `/subpages/work-detail/index?id=${encodeURIComponent(detailItem.id)}` });
  };

  return (
    <ScrollView scrollY className='records-page'>
      <View className='records-topbar'>
        <View className='records-back' onClick={handleBack}>
          <Text className='records-back-text'>‹</Text>
        </View>
      </View>
      {loading && <Text className='loading-text'>加载中...</Text>}
      {error && <Text className='error-text'>{error}</Text>}
      {!loading && !error && records.length === 0 && (
        <Text className='empty-text'>暂无生成记录</Text>
      )}
      {records.map((record) => (
        <View key={record.id} className='record-card' onClick={() => handleOpenRecord(record)}>
          <View className='record-cover'>
            {getRecordCoverUrl(record) ? (
              <Image className='record-cover-image' src={getRecordCoverUrl(record)} mode='aspectFill' />
            ) : (
              <View className='record-cover-placeholder'>
                <Text className='record-cover-placeholder-text'>{getRecordVideoUrl(record) ? '视频' : '记录'}</Text>
              </View>
            )}
            {getRecordVideoUrl(record) && (
              <View className='record-play-badge'>
                <Text className='record-play-badge-text'>▶</Text>
              </View>
            )}
          </View>
          <View className='record-info'>
            <View className='record-row'>
              <Text className='record-type'>{getRecordTypeLabel(record)}</Text>
              <Text
                className='record-status'
                style={{ color: STATUS_COLORS[record.status] ?? '#888' }}
              >
                {STATUS_LABELS[record.status] ?? record.status}
              </Text>
            </View>
            {record.scriptContent && (
              <Text className='record-script' numberOfLines={2}>{record.scriptContent}</Text>
            )}
            <Text className='record-date'>{formatDate(record.createdAt)}</Text>
            <Text className='record-action'>{getRecordVideoUrl(record) ? '点击播放' : '点击查看'}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
