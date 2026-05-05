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
  warnings?: Array<{ code?: string; message?: string }>;
  summary?: {
    inviteeCount?: number;
    totalConsumed?: number;
  };
  invitees?: Invitee[];
};

export default function ReferralsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsApiKey, setNeedsApiKey] = useState(false);
  const [payload, setPayload] = useState<ReferralsPayload | null>(null);

  const loadReferrals = async () => {
    let profile: Awaited<ReturnType<typeof miniappApi.getProfile>> | null = null;
    let lastStatusCode: number | null = null;
    try {
      setLoading(true);
      setNeedsApiKey(false);
      profile = await miniappApi.getProfile();
      const apiKey = profile?.apiKey || Taro.getStorageSync('API_KEY') || '';
      if (!apiKey) {
        setNeedsApiKey(true);
        setError('请先绑定 API Key');
        return;
      }

      const res = await Taro.request({
        url: `${__API_BASE_URL__}/api/referrals`,
        method: 'GET',
        header: {
          'Content-Type': 'application/json',
          'X-User-Api-Key': apiKey,
        },
      });
      lastStatusCode = res.statusCode;

      if (res.statusCode === 401) {
        setNeedsApiKey(true);
        throw new Error('请先绑定有效的 API Key');
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        throw new Error('加载失败');
      }

      setPayload((res.data || {}) as ReferralsPayload);
      setError(null);
    } catch (err) {
      if (lastStatusCode !== 401 && profile?.id) {
        setPayload({
          shareCode: profile.id,
          warnings: [{ code: 'REFERRAL_API_UNAVAILABLE', message: 'Referral details are temporarily unavailable' }],
          summary: { inviteeCount: 0, totalConsumed: 0 },
          invitees: [],
        });
        setError(null);
        return;
      }
      setError(err instanceof Error ? err.message : '分享有礼加载失败');
    } finally {
      setLoading(false);
    }
  };

  useLoad(() => {
    void loadReferrals();
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
        await loadReferrals();
      } catch {
        Taro.showToast({ title: '绑定失败，请重试', icon: 'none' });
      }
    })();
  };

  const shareLink = useMemo(() => {
    const code = payload?.shareCode;
    if (!code) return '';
    return `${__API_BASE_URL__}/register?ref=${encodeURIComponent(code)}`;
  }, [payload?.shareCode]);

  const warningText = useMemo(() => {
    if (!payload?.warnings?.length) return '';
    return '邀请明细暂时不可用，专属链接仍可正常分享。';
  }, [payload?.warnings?.length]);

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
      {!loading && error && (
        <View className='ref-state-card'>
          <Text className='ref-helper'>{error}</Text>
          <View className='ref-copy-btn' onClick={needsApiKey ? handleBindApiKey : loadReferrals}>
            <Text className='ref-copy-btn-text'>{needsApiKey ? '去绑定' : '重试'}</Text>
          </View>
        </View>
      )}

      {!loading && !error && (
        <>
          <View className='ref-link-card'>
            <Text className='ref-link-label'>专属链接</Text>
            <Text className='ref-link-value'>{shareLink || '暂无链接'}</Text>
            {!!warningText && <Text className='ref-warning'>{warningText}</Text>}
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
