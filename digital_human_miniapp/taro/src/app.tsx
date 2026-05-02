import './app.sass';
import Taro from '@tarojs/taro';

try {
  // 开发态默认跳过微信登录，直接进入页面。
  // 可通过 TARO_APP_API_KEY 注入真实 key。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shouldBypass = typeof __MINIAPP_BYPASS_LOGIN__ !== 'undefined' ? Boolean((__MINIAPP_BYPASS_LOGIN__ as any)) : false;
  if (shouldBypass) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const presetApiKey = typeof __MINIAPP_DEV_API_KEY__ !== 'undefined' ? String((__MINIAPP_DEV_API_KEY__ as any) || '') : '';
    if (presetApiKey) {
      Taro.setStorageSync('API_KEY', presetApiKey);
    }
    if (!Taro.getStorageSync('USER_INFO')) {
      Taro.setStorageSync('USER_INFO', JSON.stringify({
        userId: 'miniapp-local-user',
        username: '本地调试用户',
        avatarUrl: null,
        apiKey: presetApiKey || null,
      }));
    }
  }
} catch {
  // ignore init errors
}

export default function App(props: { children: React.ReactNode }) {
  return props.children;
}

export const onPageNotFound = () => {
  try {
    Taro.switchTab({ url: '/pages/home/index' });
  } catch {
    try {
      Taro.reLaunch({ url: '/pages/home/index' });
    } catch {
      // ignore
    }
  }
};
