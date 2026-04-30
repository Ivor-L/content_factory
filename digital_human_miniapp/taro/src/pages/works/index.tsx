import { View, Text, ScrollView } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useMemo, useState } from 'react';
import { miniappApi } from '../../utils/miniapp-api';
import './index.sass';

const TABS = [
  { id: 'all', label: '全部' },
  { id: 'image-text', label: '图文' },
  { id: 'video', label: '视频' },
  { id: 'copy', label: '文案' },
];

const STATUS_TEXT: Record<string, string> = {
  PENDING: '待处理',
  GENERATING: '生成中',
  COMPLETED: '已完成',
  FAILED: '失败',
};

const STATUS_CLASS: Record<string, string> = {
  PENDING: 'works-status--pending',
  GENERATING: 'works-status--generating',
  COMPLETED: 'works-status--completed',
  FAILED: 'works-status--failed',
};

export default function WorksPage() {
  const [activeTab, setActiveTab] = useState('all');
  const [works, setWorks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadWorks = async () => {
    setLoading(true);
    try {
      const data = await miniappApi.getWorkList(60);
      setWorks(data);
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
    if (activeTab === 'all') return works;
    return works.filter((item) => item.type === activeTab);
  }, [works, activeTab]);

  const handleOpenGenerate = () => {
    Taro.navigateTo({ url: '/pages/generate/index' });
  };

  const handleOpenRecords = () => {
    Taro.navigateTo({ url: '/pages/records/index' });
  };

  return (
    <View className='works-page'>
      <View className='works-header'>
        <Text className='works-title'>我的作品</Text>
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

      <View className='works-actions'>
        <View className='works-action-btn' onClick={handleOpenGenerate}>
          <Text className='works-action-text'>去创作</Text>
        </View>
        <View className='works-action-btn works-action-btn--sub' onClick={handleOpenRecords}>
          <Text className='works-action-text works-action-text--sub'>数字人记录</Text>
        </View>
      </View>

      <ScrollView scrollY className='works-list'>
        {loading && <Text className='works-helper'>加载中...</Text>}

        {!loading && filteredWorks.map((item) => {
          const statusText = STATUS_TEXT[item.status] ?? item.status;
          const statusClass = STATUS_CLASS[item.status] ?? 'works-status--pending';

          return (
            <View key={`${item.type}-${item.id}`} className='works-card'>
              <View className='works-card-top'>
                <View>
                  <Text className='works-card-title'>{item.title}</Text>
                  <Text className='works-card-date'>{formatDate(item.createdAt)}</Text>
                </View>
                <View className={`works-status ${statusClass}`}>
                  <Text className='works-status-text'>{statusText}</Text>
                </View>
              </View>

              <View className='works-card-bottom'>
                <Text className='works-type'>{getTypeLabel(item.type)}</Text>
                {item.preview ? <Text className='works-preview'>有结果可预览</Text> : <Text className='works-preview'>等待结果回写</Text>}
              </View>
            </View>
          );
        })}

        {!loading && filteredWorks.length === 0 && (
          <Text className='works-helper'>暂无作品，去创作第一条内容吧</Text>
        )}
      </ScrollView>
    </View>
  );
}

function getTypeLabel(type) {
  if (type === 'video') return '视频';
  if (type === 'image-text') return '图文';
  if (type === 'copy') return '文案';
  return '任务';
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';

  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${month}/${day} ${hour}:${minute}`;
}
