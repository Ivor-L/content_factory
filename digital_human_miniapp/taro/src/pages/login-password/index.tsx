import { View, Text, Input, Button, Video, Image } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useState } from 'react';
import { api } from '../../utils/api';
import antHeadLogoYellow from '../../assets/icons/ant-head-logo-yellow.png';
import './index.sass';

const HERO_VIDEO_OSS_URL = 'https://oss.atomx.top/miniapp/home/hero-1777626035392.mp4';
const HERO_POSTER_OSS_URL = 'https://oss.atomx.top/miniapp/home/hero-poster-1777627846532.jpg';

export default function LoginPasswordPage() {
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [heroVideoFailed, setHeroVideoFailed] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const saveAndEnter = (user: { apiKey: string; userId: string; username: string | null; avatarUrl: string | null }) => {
    Taro.setStorageSync('API_KEY', user.apiKey);
    Taro.setStorageSync('USER_INFO', JSON.stringify(user));
    Taro.switchTab({ url: '/pages/home/index' });
  };

  const loadProfileAndEnter = async () => {
    const profile = await api.getProfile();
    if (!profile?.apiKey || !profile?.id) {
      throw new Error('账号未配置 API Key，请先在网页端完成配置');
    }
    saveAndEnter({
      apiKey: profile.apiKey,
      userId: profile.id,
      username: profile.username ?? null,
      avatarUrl: profile.avatarUrl ?? null,
    });
  };

  const handleBack = () => {
    const pages = Taro.getCurrentPages();
    if (pages.length > 1) {
      Taro.navigateBack({ delta: 1 });
      return;
    }
    Taro.redirectTo({ url: '/pages/login/index' });
  };

  const handleEmailPasswordLogin = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password.trim()) {
      Taro.showToast({ title: '请输入邮箱和密码', icon: 'none' });
      return;
    }

    setPasswordLoading(true);
    try {
      await api.emailPasswordLogin({
        email: normalizedEmail,
        password: password.trim(),
      });
      await loadProfileAndEnter();
    } catch (err) {
      Taro.showToast({ title: (err as Error).message || '邮箱密码登录失败', icon: 'none' });
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <View className='login-sub-page'>
      <Video
        className='login-sub-bg-video'
        src={HERO_VIDEO_OSS_URL}
        poster={HERO_POSTER_OSS_URL}
        autoplay
        loop
        muted
        controls={false}
        showPlayBtn={false}
        showCenterPlayBtn={false}
        showFullscreenBtn={false}
        enablePlayGesture={false}
        objectFit='cover'
        initialTime={0}
        onError={() => setHeroVideoFailed(true)}
      />
      <View className='login-sub-bg-mask' />
      {heroVideoFailed && <View className='login-sub-bg-fallback' />}

      <View className='login-sub-topbar'>
        <View className='login-sub-back' onClick={handleBack}>
          <Text className='login-sub-back-text'>‹</Text>
        </View>
        <Text className='login-sub-title'>邮箱密码登录</Text>
      </View>

      <View className='login-sub-brand'>
        <View className='login-sub-brand-row'>
          <Image className='login-sub-brand-logo' src={antHeadLogoYellow} mode='aspectFill' />
          <Text className='login-sub-brand-name'>小蚁AI</Text>
        </View>
      </View>

      <View className='login-sub-content'>
        <Input
          className='login-sub-input'
          value={email}
          onInput={(e) => setEmail(e.detail.value)}
          placeholder='输入邮箱'
          placeholderClass='login-sub-input-placeholder'
        />
        <Input
          className='login-sub-input'
          type='password'
          password
          value={password}
          onInput={(e) => setPassword(e.detail.value)}
          placeholder='输入密码'
          placeholderClass='login-sub-input-placeholder'
        />

        <Button className='login-sub-btn' onClick={handleEmailPasswordLogin} loading={passwordLoading} disabled={passwordLoading}>
          邮箱密码登录
        </Button>
      </View>
    </View>
  );
}
