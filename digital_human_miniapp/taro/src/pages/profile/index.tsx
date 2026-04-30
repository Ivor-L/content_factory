import { View, Text, Input } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useState } from 'react';
import { miniappApi } from '../../utils/miniapp-api';
import './index.sass';

export default function ProfilePage() {
  const [profile, setProfile] = useState<any>(null);
  const [editingKey, setEditingKey] = useState(false);
  const [keyInput, setKeyInput] = useState('');

  useDidShow(() => {
    void (async () => {
      const data = await miniappApi.getProfile();
      setProfile(data);
    })();
  });

  const handleSaveKey = () => {
    if (!keyInput.trim()) {
      Taro.showToast({ title: '请输入 API Key', icon: 'none' });
      return;
    }
    Taro.setStorageSync('API_KEY', keyInput.trim());
    setProfile((prev) => (prev ? { ...prev, apiKey: keyInput.trim() } : prev));
    setEditingKey(false);
    Taro.showToast({ title: '已保存', icon: 'success' });
  };

  const handleLogout = () => {
    Taro.showModal({
      title: '退出登录',
      content: '确定退出当前账号吗？',
      success: ({ confirm }) => {
        if (!confirm) return;
        Taro.removeStorageSync('API_KEY');
        Taro.removeStorageSync('USER_INFO');
        Taro.reLaunch({ url: '/pages/login/index' });
      },
    });
  };

  const maskedKey = profile?.apiKey
    ? `${profile.apiKey.slice(0, 8)}${'*'.repeat(12)}`
    : '未设置';

  return (
    <View className='profile-page'>
      <View className='profile-hero'>
        <View className='profile-avatar-wrap'>
          <Text className='profile-avatar-text'>AI</Text>
        </View>
        <Text className='profile-name'>{profile?.username || '创作者'}</Text>
        <Text className='profile-id'>ID: {profile?.id ? profile.id.slice(0, 8) : '--'}</Text>
      </View>

      <View className='profile-points-card'>
        <Text className='profile-points-label'>当前积分余额</Text>
        <Text className='profile-points-value'>{typeof profile?.points === 'number' ? profile.points : '--'}</Text>
        <View className='profile-points-btn'>
          <Text className='profile-points-btn-text'>立即充值</Text>
        </View>
      </View>

      <View className='settings-card'>
        <Text className='settings-title'>API Key</Text>

        {editingKey ? (
          <View className='key-edit-row'>
            <Input
              className='key-input'
              value={keyInput}
              onInput={(e) => setKeyInput(e.detail.value)}
              placeholder='粘贴你的 API Key'
              placeholderClass='input-placeholder'
            />
            <View className='key-save-btn' onClick={handleSaveKey}>
              <Text className='key-save-text'>保存</Text>
            </View>
          </View>
        ) : (
          <View className='key-row' onClick={() => { setKeyInput(profile?.apiKey ?? ''); setEditingKey(true); }}>
            <Text className='key-value'>{maskedKey}</Text>
            <Text className='key-edit-hint'>点击修改</Text>
          </View>
        )}
      </View>

      <View className='menu-card'>
        <View className='menu-row'>
          <Text className='menu-text'>邀请好友</Text>
          <Text className='menu-arrow'>›</Text>
        </View>
        <View className='menu-row'>
          <Text className='menu-text'>我的收益</Text>
          <Text className='menu-arrow'>›</Text>
        </View>
        <View className='menu-row'>
          <Text className='menu-text'>关于我们</Text>
          <Text className='menu-arrow'>›</Text>
        </View>
      </View>

      <View className='logout-btn' onClick={handleLogout}>
        <Text className='logout-text'>退出当前会话</Text>
      </View>
    </View>
  );
}
