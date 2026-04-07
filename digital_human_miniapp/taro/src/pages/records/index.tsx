import { View, Text, Video, ScrollView } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { useState } from 'react';
import { api, type DigitalHumanVideoRecord } from '../../utils/api';
import './index.scss';

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

export default function RecordsPage() {
  const [records, setRecords] = useState<DigitalHumanVideoRecord[]>([]);
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

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <ScrollView scrollY className='records-page'>
      {loading && <Text className='loading-text'>加载中...</Text>}
      {error && <Text className='error-text'>{error}</Text>}
      {!loading && !error && records.length === 0 && (
        <Text className='empty-text'>暂无生成记录</Text>
      )}
      {records.map((record) => (
        <View key={record.id} className='record-card'>
          {record.resultUrl && (
            <Video
              src={record.resultUrl}
              className='record-video'
              controls
              showFullscreenBtn
              objectFit='cover'
            />
          )}
          <View className='record-info'>
            <View className='record-row'>
              <Text className='record-type'>{record.type === 'VOICE_CLONE' ? '文字驱动' : '音频驱动'}</Text>
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
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
