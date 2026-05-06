import { View, Text, Button, Video, Image } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { useState } from 'react';
import { api, NotBoundError } from '../../utils/api';
import { bindPendingReferral, captureReferralFromQuery } from '../../utils/referrals';
import antHeadLogoYellow from '../../assets/icons/ant-head-logo-yellow.png';
import wechatIcon from '../../assets/icons/login/wechat.svg';
import phoneIcon from '../../assets/icons/login/phone.svg';
import mailIcon from '../../assets/icons/login/mail.svg';
import passwordIcon from '../../assets/icons/login/password.svg';
import './index.sass';

const HERO_VIDEO_OSS_URL = 'https://oss.atomx.top/miniapp/home/hero-1777626035392.mp4';
const HERO_POSTER_OSS_URL = 'https://oss.atomx.top/miniapp/home/hero-poster-1777627846532.jpg';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [phoneQuickLoading, setPhoneQuickLoading] = useState(false);
  const [heroVideoFailed, setHeroVideoFailed] = useState(false);

  useLoad((query) => {
    captureReferralFromQuery(query);
    const key = Taro.getStorageSync('API_KEY');
    if (key) {
      void bindPendingReferral(key);
      Taro.switchTab({ url: '/pages/home/index' });
    }
  });

  const saveAndEnter = (user: { apiKey: string; userId: string; username: string | null; avatarUrl: string | null }) => {
    Taro.setStorageSync('API_KEY', user.apiKey);
    Taro.setStorageSync('USER_INFO', JSON.stringify(user));
    void bindPendingReferral(user.apiKey);
    Taro.switchTab({ url: '/pages/home/index' });
  };

  const handleWechatLogin = async () => {
    setLoading(true);
    try {
      const result = await api.wechatLogin();
      saveAndEnter(result);
    } catch (err) {
      if (err instanceof NotBoundError) {
        Taro.showToast({ title: '微信未绑定，请先完成手机号登录', icon: 'none' });
        Taro.navigateTo({
          url: `/subpages/login-phone/index?bind=1&openid=${encodeURIComponent(err.openid)}`,
        });
      } else {
        Taro.showToast({ title: (err as Error).message || '登录失败', icon: 'none' });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleWechatPhoneLogin = async (e: any) => {
    const phoneCode = String(e?.detail?.code || '').trim();
    if (!phoneCode) {
      Taro.showToast({ title: '未获取到手机号授权', icon: 'none' });
      return;
    }

    setPhoneQuickLoading(true);
    try {
      const result = await api.wechatPhoneLogin(phoneCode);
      saveAndEnter(result);
    } catch (err) {
      Taro.showToast({ title: (err as Error).message || '手机号一键登录失败', icon: 'none' });
    } finally {
      setPhoneQuickLoading(false);
    }
  };

  const openOtherLogin = (type: 'phone' | 'email' | 'password') => {
    const targetMap: Record<'phone' | 'email' | 'password', string> = {
      phone: '/subpages/login-phone/index',
      email: '/subpages/login-email/index',
      password: '/subpages/login-password/index',
    };
    Taro.navigateTo({ url: targetMap[type] });
  };

  return (
    <View className='login-page'>
      <Video
        className='login-bg-video'
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
      <View className='login-bg-mask' />
      {heroVideoFailed && <View className='login-bg-fallback' />}

      <View className='login-brand-top'>
        <View className='login-brand-row'>
          <Image className='login-brand-logo' src={antHeadLogoYellow} mode='aspectFill' />
          <Text className='login-brand'>小蚁AI</Text>
        </View>
        <Text className='login-slogan'>让内容营销更简单</Text>
      </View>

      <View className='login-card'>
        <Button className='entry-btn entry-btn--wechat-main' onClick={handleWechatLogin} loading={loading} disabled={loading}>
          <View className='entry-btn-inner'>
            <Image className='entry-btn-icon' src={wechatIcon} mode='aspectFit' />
            <Text className='entry-btn-label'>微信登录</Text>
          </View>
        </Button>

        <Button
          className='entry-btn entry-btn--phone-main'
          openType='getPhoneNumber'
          onGetPhoneNumber={handleWechatPhoneLogin}
          loading={phoneQuickLoading}
          disabled={phoneQuickLoading}
        >
          <View className='entry-btn-inner'>
            <Image className='entry-btn-icon' src={phoneIcon} mode='aspectFit' />
            <Text className='entry-btn-label'>一键登录</Text>
          </View>
        </Button>

        <Text className='other-login-title'>其他登录方式</Text>
        <View className='other-login-row'>
          <View className='other-login-icon' onClick={() => openOtherLogin('phone')}>
            <Image className='other-login-icon-image' src={phoneIcon} mode='aspectFit' />
          </View>
          <View className='other-login-icon' onClick={() => openOtherLogin('email')}>
            <Image className='other-login-icon-image' src={mailIcon} mode='aspectFit' />
          </View>
          <View className='other-login-icon' onClick={() => openOtherLogin('password')}>
            <Image className='other-login-icon-image' src={passwordIcon} mode='aspectFit' />
          </View>
        </View>
      </View>
    </View>
  );
}
