import { View, Text } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useState } from 'react';
import { miniappApi } from '../../utils/miniapp-api';
import './index.sass';

const QUICK_ACTIONS = [
  { id: 'copy', title: '写文案', desc: '智能生成高转化文案', path: '/pages/generate/index', badge: '文案' },
  { id: 'image-text', title: '做图文', desc: '一键复刻爆款图文内容', path: '/pages/hot-square/index', badge: '图文' },
  { id: 'video', title: '做视频', desc: '数字人驱动，快速生成短视频', path: '/pages/generate/index', badge: '视频' },
];

export default function HomePage() {
  const [profile, setProfile] = useState<any>(null);

  useDidShow(() => {
    void (async () => {
      try {
        const data = await miniappApi.getProfile();
        setProfile(data);
      } catch {
        // Keep page usable even if profile request fails.
      }
    })();
  });

  const nickname = profile?.username || '创作者';
  const pointsText = typeof profile?.points === 'number' ? String(profile.points) : '--';

  const handleNavigate = (path) => {
    if (path.startsWith('/pages/home') || path.startsWith('/pages/hot-square') || path.startsWith('/pages/assets') || path.startsWith('/pages/works') || path.startsWith('/pages/profile')) {
      Taro.switchTab({ url: path });
      return;
    }
    Taro.navigateTo({ url: path });
  };

  return (
    <View className='home-page'>
      <View className='home-header'>
        <View>
          <Text className='home-greeting'>你好，{nickname}</Text>
          <Text className='home-subtitle'>今天想创作点什么？</Text>
        </View>
      </View>

      <View className='home-promo-card'>
        <Text className='home-promo-tag'>AI 创作助手 Pro</Text>
        <Text className='home-promo-title'>效率提升 10 倍</Text>
        <Text className='home-promo-desc'>文案、图文、视频一站式生成</Text>
        <View className='home-promo-points'>
          <Text className='home-promo-points-label'>当前积分</Text>
          <Text className='home-promo-points-value'>{pointsText}</Text>
        </View>
      </View>

      <View className='home-section'>
        <Text className='home-section-title'>创作中心</Text>
        <View className='home-action-list'>
          {QUICK_ACTIONS.map((item) => (
            <View key={item.id} className='home-action-card' onClick={() => handleNavigate(item.path)}>
              <View className='home-action-left'>
                <Text className='home-action-badge'>{item.badge}</Text>
              </View>
              <View className='home-action-main'>
                <Text className='home-action-title'>{item.title}</Text>
                <Text className='home-action-desc'>{item.desc}</Text>
              </View>
              <Text className='home-action-arrow'>›</Text>
            </View>
          ))}
        </View>
      </View>

      <View className='home-section'>
        <View className='home-section-head'>
          <Text className='home-section-title'>最近创作</Text>
          <Text className='home-section-link' onClick={() => Taro.switchTab({ url: '/pages/works/index' })}>查看全部</Text>
        </View>
        <View className='home-recent-card'>
          <Text className='home-recent-title'>从爆款广场一键创作</Text>
          <Text className='home-recent-desc'>选中任意爆款内容，直接生成你的同款图文或脚本。</Text>
          <View className='home-recent-btn' onClick={() => Taro.switchTab({ url: '/pages/hot-square/index' })}>
            <Text className='home-recent-btn-text'>去爆款广场</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
