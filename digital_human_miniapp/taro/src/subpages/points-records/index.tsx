import { View, Text, ScrollView } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { useState } from 'react';
import { miniappApi } from '../../utils/miniapp-api';
import './index.sass';

type UsageEvent = {
  id: string;
  createdAt: string | null;
  description: string | null;
  workflowName: string | null;
  reason: string | null;
  amount: number | null;
  delta: number | null;
  balanceAfter: number | null;
};

export default function PointsRecordsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsApiKey, setNeedsApiKey] = useState(false);
  const [events, setEvents] = useState<UsageEvent[]>([]);

  const loadEvents = async () => {
    try {
      setLoading(true);
      setNeedsApiKey(false);
      const profile = await miniappApi.getProfile();
      const apiKey = profile?.apiKey || Taro.getStorageSync('API_KEY') || '';
      if (!apiKey) {
        setNeedsApiKey(true);
        setError('请先绑定 API Key');
        return;
      }
      const res = await Taro.request({
        url: `${__API_BASE_URL__}/api/integration/usage?page=1&size=50`,
        method: 'GET',
        header: {
          'Content-Type': 'application/json',
          'X-User-Api-Key': apiKey,
        },
      });

      if (res.statusCode === 401) {
        setNeedsApiKey(true);
        throw new Error('请先绑定有效的 API Key');
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        throw new Error('加载失败');
      }

      const payload = res.data as { events?: UsageEvent[] };
      setEvents(Array.isArray(payload?.events) ? payload.events : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '算力值记录加载失败');
    } finally {
      setLoading(false);
    }
  };

  useLoad(() => {
    void loadEvents();
  });

  const handleBindApiKey = async () => {
    const modal = await Taro.showModal({
      title: '绑定 API Key',
      editable: true,
      placeholderText: '请输入你的 API Key',
      content: '',
      confirmText: '绑定',
      cancelText: '取消',
    });

    if (!modal.confirm) return;
    const apiKey = (modal.content || '').trim();
    if (!apiKey) {
      Taro.showToast({ title: 'API Key 不能为空', icon: 'none' });
      return;
    }

    void (async () => {
      try {
        Taro.setStorageSync('API_KEY', apiKey);
        setNeedsApiKey(false);
        Taro.showToast({ title: '已绑定 API Key', icon: 'success' });
        await loadEvents();
      } catch {
        Taro.showToast({ title: '绑定失败，请重试', icon: 'none' });
      }
    })();
  };

  const handleBack = () => {
    const pages = Taro.getCurrentPages();
    if (pages.length > 1) {
      Taro.navigateBack({ delta: 1 });
      return;
    }
    Taro.switchTab({ url: '/pages/profile/index' });
  };

  const formatDate = (value: string | null) => {
    if (!value) return '--';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '--';
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${month}/${day} ${hh}:${mm}`;
  };

  const formatDelta = (event: UsageEvent) => {
    if (typeof event.delta === 'number') {
      if (event.delta > 0) return `+${event.delta}`;
      return `${event.delta}`;
    }
    if (typeof event.amount === 'number') {
      return `-${event.amount}`;
    }
    return '--';
  };

  return (
    <ScrollView scrollY className='points-page'>
      <View className='points-topbar'>
        <View className='points-back' onClick={handleBack}>
          <Text className='points-back-text'>‹</Text>
        </View>
        <Text className='points-title'>算力值消耗记录</Text>
      </View>

      {loading && <Text className='points-helper'>加载中...</Text>}
      {!loading && error && (
        <View className='points-state-card'>
          <Text className='points-helper'>{error}</Text>
          <View className='points-action-btn' onClick={needsApiKey ? handleBindApiKey : loadEvents}>
            <Text className='points-action-btn-text'>{needsApiKey ? '去绑定' : '重试'}</Text>
          </View>
        </View>
      )}
      {!loading && !error && events.length === 0 && <Text className='points-helper'>暂无算力值记录</Text>}

      {!loading && !error && events.map((event) => (
        <View key={event.id} className='points-card'>
          <View className='points-card-top'>
            <Text className='points-card-title'>{event.reason || event.description || event.workflowName || '算力值变动'}</Text>
            <Text className={`points-card-delta ${(typeof event.delta === 'number' && event.delta < 0) || typeof event.amount === 'number' ? 'points-card-delta--minus' : 'points-card-delta--plus'}`}>
              {formatDelta(event)}
            </Text>
          </View>
          <View className='points-card-bottom'>
            <Text className='points-card-date'>{formatDate(event.createdAt)}</Text>
            <Text className='points-card-balance'>剩余算力值：{typeof event.balanceAfter === 'number' ? event.balanceAfter : '--'}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
