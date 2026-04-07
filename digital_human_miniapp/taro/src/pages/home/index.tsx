import { View, Text, Image } from '@tarojs/components';
import Taro from '@tarojs/taro';
import './index.scss';

const QUICK_ACTIONS = [
  { label: '形象库', path: '/pages/warehouse/index', icon: '🧑' },
  { label: '生成视频', path: '/pages/generate/index', icon: '🎬' },
  { label: '生成记录', path: '/pages/records/index', icon: '📋' },
];

export default function HomePage() {
  const userInfoStr = Taro.getStorageSync('USER_INFO');
  const userInfo = userInfoStr ? JSON.parse(userInfoStr as string) : null;
  const username = userInfo?.username ?? '用户';

  const navigate = (path: string) => {
    if (path.startsWith('/pages/home') || path.startsWith('/pages/warehouse') ||
        path.startsWith('/pages/generate') || path.startsWith('/pages/records') ||
        path.startsWith('/pages/profile')) {
      Taro.switchTab({ url: path });
    } else {
      Taro.navigateTo({ url: path });
    }
  };

  return (
    <View className='home-page'>
      <View className='home-header'>
        <View>
          <Text className='home-greeting'>你好，{username} 👋</Text>
          <Text className='home-subtitle'>开始生成你的数字人视频</Text>
        </View>
        {userInfo?.avatarUrl && (
          <Image className='home-avatar' src={userInfo.avatarUrl} mode='aspectFill' />
        )}
      </View>

      <View className='home-card' onClick={() => navigate('/pages/generate/index')}>
        <View className='home-card-inner'>
          <Text className='home-card-tag'>AI 视频生成</Text>
          <Text className='home-card-title'>数字人营销视频</Text>
          <Text className='home-card-desc'>上传形象 + 音频，一键生成原生感数字人视频</Text>
          <View className='home-card-btn'>
            <Text className='home-card-btn-text'>立即生成</Text>
          </View>
        </View>
      </View>

      <View className='quick-grid'>
        {QUICK_ACTIONS.map((action) => (
          <View
            key={action.path}
            className='quick-item'
            onClick={() => navigate(action.path)}
          >
            <Text className='quick-icon'>{action.icon}</Text>
            <Text className='quick-label'>{action.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
