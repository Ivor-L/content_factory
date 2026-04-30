import { View, Text, Button, Input } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { useState } from 'react';
import { api, NotBoundError } from '../../utils/api';
import './index.sass';
import './index.sass';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [bindMode, setBindMode] = useState(false);
  const [openid, setOpenid] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [binding, setBinding] = useState(false);

  useLoad(() => {
    // 已登录则直接跳首页
    const key = Taro.getStorageSync('API_KEY');
    if (key) {
      Taro.switchTab({ url: '/pages/home/index' });
    }
  });

  const handleLogin = async () => {
    setLoading(true);
    try {
      const result = await api.wechatLogin();
      Taro.setStorageSync('API_KEY', result.apiKey);
      Taro.setStorageSync('USER_INFO', JSON.stringify(result));
      Taro.switchTab({ url: '/pages/home/index' });
    } catch (err) {
      if (err instanceof NotBoundError) {
        setOpenid(err.openid);
        setBindMode(true);
      } else {
        Taro.showToast({ title: (err as Error).message || '登录失败', icon: 'none' });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBind = async () => {
    if (!apiKeyInput.trim()) {
      Taro.showToast({ title: '请输入 API Key', icon: 'none' });
      return;
    }
    setBinding(true);
    try {
      const result = await api.wechatBind(openid, apiKeyInput.trim());
      Taro.setStorageSync('API_KEY', result.apiKey);
      Taro.setStorageSync('USER_INFO', JSON.stringify(result));
      Taro.switchTab({ url: '/pages/home/index' });
    } catch (err) {
      Taro.showToast({ title: (err as Error).message || '绑定失败', icon: 'none' });
    } finally {
      setBinding(false);
    }
  };

  if (bindMode) {
    return (
      <View className='login-page'>
        <View className='login-card'>
          <Text className='login-title'>绑定账号</Text>
          <Text className='login-desc'>
            该微信未绑定账号，请输入你在网页版的 API Key 完成绑定。
          </Text>
          <Input
            className='login-input'
            value={apiKeyInput}
            onInput={(e) => setApiKeyInput(e.detail.value)}
            placeholder='粘贴你的 API Key'
            placeholderClass='input-placeholder'
          />
          <Button className='btn-primary' onClick={handleBind} loading={binding} disabled={binding}>
            确认绑定
          </Button>
          <Button className='btn-secondary mt-16' onClick={() => setBindMode(false)}>
            返回
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View className='login-page'>
      <View className='login-card'>
        <View className='login-logo'>
          <Text className='login-logo-text'>数字人</Text>
        </View>
        <Text className='login-title'>欢迎使用数字人小程序</Text>
        <Text className='login-desc'>使用微信账号一键登录，开始生成你的数字人营销视频</Text>
        <Button
          className='btn-primary btn-wechat'
          onClick={handleLogin}
          loading={loading}
          disabled={loading}
        >
          微信一键登录
        </Button>
      </View>
    </View>
  );
}
