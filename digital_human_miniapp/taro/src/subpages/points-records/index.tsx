import { View, Text, ScrollView } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { useState } from 'react';
import { miniappApi } from '../../utils/miniapp-api';
import { useMiniappShare } from '../../utils/miniapp-share';
import './index.sass';

type UsageEvent = {
  id: string;
  createdAt: string | null;
  description: string | null;
  workflowId?: string | null;
  workflowName: string | null;
  reason: string | null;
  amount: number | null;
  delta: number | null;
  balanceAfter: number | null;
};

const FEATURE_NAME_MAP: Record<string, string> = {
  action_transfer: '动作复刻视频',
  action_transfer_video: '动作复刻视频',
  canvas_image_generation: 'AI 作图',
  canvas_image_understanding: '图片理解',
  digital_human: '数字人视频',
  image_text_replication: '图文复刻',
  image_text_rewrite: '图文仿写',
  infographic: '信息图生成',
  keling_video: '视频生成',
  kling_video: '视频生成',
  miniapp_canvas_image: 'AI 作图',
  nano_banana: 'AI 作图',
  product_analysis: '产品分析',
  remix_breakdown: '爆款拆解',
  remix_video: '复刻视频生成',
  storyboard_breakdown: '分镜拆解',
  storyboard_image: '分镜图片生成',
  storyboard_merge: '分镜成片合成',
  storyboard_video: '分镜视频生成',
  video_generation: '视频生成',
  xhs_card: '图文卡片生成',
  xhs_image: '小红书图片生成',
  xhs_text2img: '小红书卡片生成',
};

const GENERIC_USAGE_KEYS = new Set([
  'consume',
  'consumed',
  'credit',
  'credit_consume',
  'credit_consumed',
  'credits',
  'credits_consume',
  'credits_consumed',
  'deduct',
  'deducted',
  'deduction',
  'points',
  'usage',
]);

function normalizeFeatureKey(value: string | null | undefined) {
  return String(value || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s./:-]+/g, '_')
    .replace(/_+/g, '_')
    .toLowerCase();
}

function humanizeFeatureName(value: string | null | undefined) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const key = normalizeFeatureKey(raw);
  if (FEATURE_NAME_MAP[key]) return FEATURE_NAME_MAP[key];
  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function mappedFeatureName(value: string | null | undefined) {
  const key = normalizeFeatureKey(value);
  if (!key || GENERIC_USAGE_KEYS.has(key)) return '';
  return FEATURE_NAME_MAP[key] || '';
}

export default function PointsRecordsPage() {
  useMiniappShare();

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

  const getFeatureName = (event: UsageEvent) => {
    const candidates = [
      event.reason,
      event.description,
      event.workflowName,
      event.workflowId,
    ];
    for (const candidate of candidates) {
      const name = mappedFeatureName(candidate);
      if (name) return name;
    }
    const workflowFallback = humanizeFeatureName(event.workflowName || event.workflowId);
    if (workflowFallback) return workflowFallback;
    const descriptionFallback = humanizeFeatureName(event.description || event.reason);
    if (descriptionFallback) return descriptionFallback;
    return '算力值变动';
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
            <Text className='points-card-title'>{getFeatureName(event)}</Text>
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
