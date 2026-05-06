import { View, Text, Input, Button, Video, Image } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useEffect, useState } from 'react';
import { api } from '../../utils/api';
import { bindPendingReferral } from '../../utils/referrals';
import antHeadLogoYellow from '../../assets/icons/ant-head-logo-yellow.png';
import './index.sass';

const HERO_VIDEO_OSS_URL = 'https://oss.atomx.top/miniapp/home/hero-1777626035392.mp4';
const HERO_POSTER_OSS_URL = 'https://oss.atomx.top/miniapp/home/hero-poster-1777627846532.jpg';

export default function LoginEmailPage() {
  const [sendingEmailCode, setSendingEmailCode] = useState(false);
  const [verifyingEmailCode, setVerifyingEmailCode] = useState(false);
  const [heroVideoFailed, setHeroVideoFailed] = useState(false);

  const [email, setEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailCountdown, setEmailCountdown] = useState(0);

  useEffect(() => {
    if (emailCountdown <= 0) return;
    const timer = setTimeout(() => setEmailCountdown((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [emailCountdown]);

  const saveAndEnter = (user: { apiKey: string; userId: string; username: string | null; avatarUrl: string | null }) => {
    Taro.setStorageSync('API_KEY', user.apiKey);
    Taro.setStorageSync('USER_INFO', JSON.stringify(user));
    void bindPendingReferral(user.apiKey);
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
    Taro.redirectTo({ url: '/subpages/login/index' });
  };

  const handleSendEmailCode = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      Taro.showToast({ title: '请输入邮箱', icon: 'none' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      Taro.showToast({ title: '邮箱格式不正确', icon: 'none' });
      return;
    }

    setSendingEmailCode(true);
    try {
      const res = await api.emailSendCode(normalizedEmail);
      setEmailCountdown(typeof res.ttlSeconds === 'number' && res.ttlSeconds > 0 ? Math.min(res.ttlSeconds, 60) : 60);
      Taro.showToast({ title: '验证码已发送到邮箱', icon: 'success' });
    } catch (err) {
      Taro.showToast({ title: (err as Error).message || '发送失败', icon: 'none' });
    } finally {
      setSendingEmailCode(false);
    }
  };

  const handleVerifyEmailCode = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    const otp = emailCode.trim();
    if (!normalizedEmail || !otp) {
      Taro.showToast({ title: '请输入邮箱和验证码', icon: 'none' });
      return;
    }

    setVerifyingEmailCode(true);
    try {
      const verified = await api.emailVerify({ email: normalizedEmail, otp });
      const accessToken = verified?.session?.access_token?.trim();
      if (!accessToken) {
        throw new Error('邮箱验证码无效');
      }

      await api.createMiniappSession(accessToken);
      await loadProfileAndEnter();
    } catch (err) {
      Taro.showToast({ title: (err as Error).message || '邮箱登录失败', icon: 'none' });
    } finally {
      setVerifyingEmailCode(false);
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
        <Text className='login-sub-title'>邮箱验证码登录</Text>
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

        <View className='login-sub-code-row'>
          <Input
            className='login-sub-input login-sub-code-input'
            value={emailCode}
            onInput={(e) => setEmailCode(e.detail.value)}
            placeholder='输入邮箱验证码'
            placeholderClass='login-sub-input-placeholder'
          />
          <Button
            className='login-sub-code-btn'
            onClick={handleSendEmailCode}
            loading={sendingEmailCode}
            disabled={sendingEmailCode || emailCountdown > 0}
          >
            {emailCountdown > 0 ? `${emailCountdown}s` : '获取验证码'}
          </Button>
        </View>

        <Button className='login-sub-btn' onClick={handleVerifyEmailCode} loading={verifyingEmailCode} disabled={verifyingEmailCode}>
          邮箱验证码登录
        </Button>
      </View>
    </View>
  );
}
