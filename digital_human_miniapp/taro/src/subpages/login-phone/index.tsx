import { View, Text, Input, Button, Video, Image } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../utils/api';
import antHeadLogoYellow from '../../assets/icons/ant-head-logo-yellow.png';
import './index.sass';

const HERO_VIDEO_OSS_URL = 'https://oss.atomx.top/miniapp/home/hero-1777626035392.mp4';
const HERO_POSTER_OSS_URL = 'https://oss.atomx.top/miniapp/home/hero-poster-1777627846532.jpg';

type PhonePurpose = 'login';

function normalizePhone(input: string): string {
  const raw = input.trim().replace(/\s+/g, '');
  if (!raw) return '';
  if (raw.startsWith('+')) return raw;
  if (/^1\d{10}$/.test(raw)) return `+86${raw}`;
  return `+${raw}`;
}

function toLoginUser(result: {
  apiKey?: string;
  userId?: string;
  username?: string | null;
  avatarUrl?: string | null;
}) {
  if (!result.apiKey || !result.userId) {
    throw new Error('登录返回数据不完整');
  }

  return {
    apiKey: result.apiKey,
    userId: result.userId,
    username: result.username ?? null,
    avatarUrl: result.avatarUrl ?? null,
  };
}

export default function LoginPhonePage() {
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [heroVideoFailed, setHeroVideoFailed] = useState(false);

  const [bindMode, setBindMode] = useState(false);
  const [openid, setOpenid] = useState('');

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [purpose] = useState<PhonePurpose>('login');
  const [phoneCountdown, setPhoneCountdown] = useState(0);

  const normalizedPhone = useMemo(() => normalizePhone(phone), [phone]);

  useEffect(() => {
    if (phoneCountdown <= 0) return;
    const timer = setTimeout(() => setPhoneCountdown((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [phoneCountdown]);

  useLoad((options) => {
    const shouldBind = String(options?.bind || '') === '1';
    const oid = String(options?.openid || '');
    setBindMode(shouldBind);
    setOpenid(oid);
  });

  const saveAndEnter = (user: { apiKey: string; userId: string; username: string | null; avatarUrl: string | null }) => {
    Taro.setStorageSync('API_KEY', user.apiKey);
    Taro.setStorageSync('USER_INFO', JSON.stringify(user));
    Taro.switchTab({ url: '/pages/home/index' });
  };

  const handleBack = () => {
    const pages = Taro.getCurrentPages();
    if (pages.length > 1) {
      Taro.navigateBack({ delta: 1 });
      return;
    }
    Taro.redirectTo({ url: '/subpages/login/index' });
  };

  const handleSendCode = async () => {
    if (!normalizedPhone) {
      Taro.showToast({ title: '请输入手机号', icon: 'none' });
      return;
    }

    setSendingCode(true);
    try {
      const res = await api.phoneSendCode(normalizedPhone, purpose);
      setPhoneCountdown(typeof res.ttlSeconds === 'number' && res.ttlSeconds > 0 ? Math.min(res.ttlSeconds, 60) : 60);
      if (res.devCode) {
        Taro.showToast({ title: `开发验证码: ${res.devCode}`, icon: 'none', duration: 2000 });
      } else {
        Taro.showToast({ title: '验证码已发送', icon: 'success' });
      }
    } catch (err) {
      Taro.showToast({ title: (err as Error).message || '发送失败', icon: 'none' });
    } finally {
      setSendingCode(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!normalizedPhone || !code.trim()) {
      Taro.showToast({ title: '请输入手机号和验证码', icon: 'none' });
      return;
    }

    setVerifyingCode(true);
    try {
      const res = await api.phoneVerify({
        phone: normalizedPhone,
        code: code.trim(),
        purpose: 'login',
      });

      if (!res.ok) {
        if (res.needSignup) {
          Taro.showToast({ title: '该手机号未注册，请先在网页注册邮箱账号', icon: 'none' });
          return;
        }
        Taro.showToast({ title: res.message || '验证码校验失败', icon: 'none' });
        return;
      }

      if (bindMode) {
        const loginUser = toLoginUser(res);
        await api.wechatBind(openid, loginUser.apiKey);
        saveAndEnter(loginUser);
        return;
      }

      saveAndEnter(toLoginUser(res));
    } catch (err) {
      Taro.showToast({ title: (err as Error).message || '登录失败', icon: 'none' });
    } finally {
      setVerifyingCode(false);
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
        <Text className='login-sub-title'>手机号验证码登录</Text>
      </View>

      <View className='login-sub-brand'>
        <View className='login-sub-brand-row'>
          <Image className='login-sub-brand-logo' src={antHeadLogoYellow} mode='aspectFill' />
          <Text className='login-sub-brand-name'>小蚁AI</Text>
        </View>
      </View>

      <View className='login-sub-content'>
        {bindMode && <Text className='login-sub-tip'>登录成功后将自动绑定当前微信。</Text>}

        <Input
          className='login-sub-input'
          value={phone}
          onInput={(e) => setPhone(e.detail.value)}
          placeholder='输入手机号'
          placeholderClass='login-sub-input-placeholder'
        />

        <View className='login-sub-code-row'>
          <Input
            className='login-sub-input login-sub-code-input'
            value={code}
            onInput={(e) => setCode(e.detail.value)}
            placeholder='输入验证码'
            placeholderClass='login-sub-input-placeholder'
          />
          <Button
            className='login-sub-code-btn'
            onClick={handleSendCode}
            loading={sendingCode}
            disabled={sendingCode || phoneCountdown > 0}
          >
            {phoneCountdown > 0 ? `${phoneCountdown}s` : '获取验证码'}
          </Button>
        </View>

        <Button className='login-sub-btn' onClick={handleVerifyCode} loading={verifyingCode} disabled={verifyingCode}>
          {bindMode ? '验证并绑定微信' : '手机号登录'}
        </Button>
      </View>
    </View>
  );
}
