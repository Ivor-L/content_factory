import { View, Text, ScrollView } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { useMemo, useState } from 'react';
import { miniappApi } from '../../utils/miniapp-api';
import './index.sass';

type Invitee = {
  bindingId: string;
  inviteeId: string;
  createdAt: string;
  name: string | null;
  totalConsumed: number | null;
};

type ReferralsPayload = {
  shareCode?: string;
  summary?: {
    inviteeCount?: number;
    totalConsumed?: number;
  };
  invitees?: Invitee[];
};

export default function ReferralsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<ReferralsPayload | null>(null);

  useLoad(() => {
    void (async () => {
      try {
        setLoading(true);
        const profile = await miniappApi.getProfile();
        const apiKey = profile?.apiKey || Taro.getStorageSync('API_KEY') || '';
        if (!apiKey) throw new Error('未绑定 API Key');

        const res = await Taro.request({
          url: `${__API_BASE_URL__}/api/referrals`,
          method: 'GET',
          header: {
            'Content-Type': 'application/json',
            'X-User-Api-Key': apiKey,
          },
        });

        if (res.statusCode < 200 || res.statusCode >= 300) {
          throw new Error('加载失败');
        }

        setPayload((res.data || {}) as ReferralsPayload);
        setError(null);
      } catch {
        setError('分享有礼加载失败');
      } finally {
        setLoading(false);
      }
    })();
  });

  const shareLink = useMemo(() => {
    const code = payload?.shareCode;
    if (!code) return '';
    return `${__API_BASE_URL__}/share?ref=${encodeURIComponent(code)}`;
  }, [payload?.shareCode]);

  const handleBack = () => {
    const pages = Taro.getCurrentPages();
    if (pages.length > 1) {
      Taro.navigateBack({ delta: 1 });
      return;
    }
    Taro.switchTab({ url: '/pages/profile/index' });
  };

  const handleCopy = async () => {
    if (!shareLink) return;
    try {
      await Taro.setClipboardData({ data: shareLink });
      Taro.showToast({ title: '链接已复制', icon: 'success' });
    } catch {
      Taro.showToast({ title: '复制失败', icon: 'none' });
    }
  };

  const formatDate = (value?: string) => {
    if (!value) return '--';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '--';
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  return (
    <ScrollView scrollY className='ref-page'>
      <View className='ref-topbar'>
        <View className='ref-back' onClick={handleBack}>
          <Text className='ref-back-text'>‹</Text>
        </View>
        <Text className='ref-title'>分享有礼</Text>
      </View>

      {loading && <Text className='ref-helper'>加载中...</Text>}
      {!loading && error && <Text className='ref-helper'>{error}</Text>}

      {!loading && !error && (
        <>
          <View className='ref-link-card'>
            <Text className='ref-link-label'>专属链接</Text>
            <Text className='ref-link-value'>{shareLink || '暂无链接'}</Text>
            <View className='ref-copy-btn' onClick={handleCopy}>
              <Text className='ref-copy-btn-text'>复制链接</Text>
            </View>
          </View>

          <View className='ref-stats-row'>
            <View className='ref-stat'>
              <Text className='ref-stat-num'>{payload?.summary?.inviteeCount ?? 0}</Text>
              <Text className='ref-stat-label'>绑定用户</Text>
            </View>
            <View className='ref-stat'>
              <Text className='ref-stat-num'>{payload?.summary?.totalConsumed ?? 0}</Text>
              <Text className='ref-stat-label'>累计消耗</Text>
            </View>
          </View>

          <View className='ref-list'>
            {(payload?.invitees || []).map((item) => (
              <View key={item.bindingId} className='ref-row'>
                <View>
                  <Text className='ref-row-name'>{item.name || item.inviteeId.slice(0, 8)}</Text>
                  <Text className='ref-row-date'>绑定于 {formatDate(item.createdAt)}</Text>
                </View>
                <Text className='ref-row-consume'>{typeof item.totalConsumed === 'number' ? item.totalConsumed : '--'}</Text>
              </View>
            ))}
            {(payload?.invitees || []).length === 0 && <Text className='ref-empty'>还没有绑定用户</Text>}
          </View>
        </>
      )}
    </ScrollView>
  );
}
