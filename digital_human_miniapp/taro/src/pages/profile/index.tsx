import { View, Text, Image, Input } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { useState } from 'react';
import './index.scss';

export default function ProfilePage() {
  const [userInfo, setUserInfo] = useState<{
    apiKey?: string; userId?: string; username?: string | null; avatarUrl?: string | null;
  } | null>(null);
  const [editingKey, setEditingKey] = useState(false);
  const [keyInput, setKeyInput] = useState('');

  useLoad(() => {
    const str = Taro.getStorageSync('USER_INFO');
    const apiKey = Taro.getStorageSync('API_KEY');
    if (str) {
      const info = JSON.parse(str as string);
      setUserInfo({ ...info, apiKey: apiKey || info.apiKey });
    }
  });

  const handleSaveKey = () => {
    if (!keyInput.trim()) return;
    Taro.setStorageSync('API_KEY', keyInput.trim());
    setUserInfo((prev) => ({ ...prev, apiKey: keyInput.trim() }));
    setEditingKey(false);
    Taro.showToast({ title: '已保存', icon: 'success' });
  };

  const handleLogout = () => {
    Taro.showModal({
      title: '退出登录',
      content: '确定要退出登录吗？',
      success: ({ confirm }) => {
        if (!confirm) return;
        Taro.removeStorageSync('API_KEY');
        Taro.removeStorageSync('USER_INFO');
        Taro.reLaunch({ url: '/pages/login/index' });
      },
    });
  };

  const maskedKey = userInfo?.apiKey
    ? `${userInfo.apiKey.slice(0, 8)}${'*'.repeat(12)}`
    : '未设置';

  return (
    <View className='profile-page'>
      <View className='profile-card'>
        {userInfo?.avatarUrl
          ? <Image className='profile-avatar' src={userInfo.avatarUrl} mode='aspectFill' />
          : <View className='profile-avatar-placeholder'><Text className='profile-avatar-text'>👤</Text></View>
        }
        <Text className='profile-name'>{userInfo?.username ?? '用户'}</Text>
        <Text className='profile-id'>ID: {userInfo?.userId?.slice(0, 8) ?? '--'}</Text>
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
          <View className='key-row' onClick={() => { setKeyInput(userInfo?.apiKey ?? ''); setEditingKey(true); }}>
            <Text className='key-value'>{maskedKey}</Text>
            <Text className='key-edit-hint'>点击修改</Text>
          </View>
        )}
      </View>

      <View className='logout-btn' onClick={handleLogout}>
        <Text className='logout-text'>退出登录</Text>
      </View>
    </View>
  );
}
