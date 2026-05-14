import { View, Text, Image } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useState } from 'react';
import { miniappApi } from '../../utils/miniapp-api';
import { api } from '../../utils/api';
import { useMiniappShare } from '../../utils/miniapp-share';
import customerServiceQr from '../../assets/icons/customer-service-qr.jpg';
import './index.sass';

const PROFILE_ICONS = {
  avatar: encodeSvgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" stroke="#f1efaf" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="16" cy="11.2" r="5"/>
  <path d="M7.6 26c1.7-5.2 4.5-7.8 8.4-7.8s6.7 2.6 8.4 7.8"/>
</svg>
`),
  role: encodeSvgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" stroke="#f1efaf" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="13" cy="11.5" r="4.6"/>
  <path d="M5.8 25.4c1.4-4.9 3.8-7.3 7.2-7.3s5.8 2.4 7.2 7.3"/>
  <path d="M20 10.4a4 4 0 0 1 0 7.2"/>
  <path d="M22.4 20.2c2 .9 3.3 2.7 3.8 5.2"/>
</svg>
`),
  product: encodeSvgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" stroke="#f1efaf" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
  <path d="M7.5 11.2 16 6.4l8.5 4.8v9.6L16 25.6l-8.5-4.8z"/>
  <path d="M7.5 11.2 16 16l8.5-4.8"/>
  <path d="M16 16v9.6"/>
</svg>
`),
  style: encodeSvgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" stroke="#f1efaf" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
  <path d="M9 23 23 9"/>
  <path d="m20.5 6.5 5 5"/>
  <path d="M7 9.5h4.8"/>
  <path d="M9.4 7.1v4.8"/>
  <path d="M20.2 22.4h4.8"/>
  <path d="M22.6 20v4.8"/>
</svg>
`),
  knowledge: encodeSvgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" stroke="#f1efaf" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
  <path d="M7.5 7.8h7.2c2.1 0 3.3 1.1 3.3 3.3v14.1c0-2.1-1.2-3.3-3.3-3.3H7.5z"/>
  <path d="M24.5 7.8h-3.2c-2.1 0-3.3 1.1-3.3 3.3v14.1c0-2.1 1.2-3.3 3.3-3.3h3.2z"/>
  <path d="M11 12.2h3.5"/>
  <path d="M21 12.2h1.8"/>
</svg>
`),
  share: encodeSvgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" stroke="#f1efaf" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="9.2" cy="16" r="3.6"/>
  <circle cx="22.8" cy="8.8" r="3.6"/>
  <circle cx="22.8" cy="23.2" r="3.6"/>
  <path d="m12.4 14.3 7.2-3.8"/>
  <path d="m12.4 17.7 7.2 3.8"/>
</svg>
`),
  points: encodeSvgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" stroke="#f1efaf" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="16" cy="16" r="10"/>
  <path d="M17.4 7.8 11.2 17h5.2l-1.8 7.2 6.2-9.2h-5.2z"/>
</svg>
`),
};

type ProfileIconType = keyof typeof PROFILE_ICONS;

export default function ProfilePage() {
  useMiniappShare({
    title: '小蚁AI - AI内容创作工作台',
    path: '/pages/profile/index',
  });

  const [profile, setProfile] = useState<any>(null);
  const [updatingAvatar, setUpdatingAvatar] = useState(false);
  const [updatingName, setUpdatingName] = useState(false);
  const [customerServiceOpen, setCustomerServiceOpen] = useState(false);
  const [overview, setOverview] = useState({
    templates: 0,
    products: 0,
    styles: 0,
    characters: 0,
  });
  const hasIdentity = Boolean(profile?.id || profile?.apiKey || Taro.getStorageSync('API_KEY'));
  const displayName = hasIdentity ? (profile?.username || profile?.full_name || '未命名用户') : '未登录用户';
  const displayId = profile?.id ? profile.id.slice(0, 8) : '--';

  useDidShow(() => {
    void (async () => {
      try {
        const [profileData, assetData] = await Promise.all([
          miniappApi.getProfile(),
          miniappApi.getAssetOverview(),
        ]);
        setProfile(profileData);
        setOverview(assetData);
      } catch {
        // Keep page usable even if request fails.
      }
    })();
  });

  const handleOpenLibrary = (title: string) => {
    const openLibraryPage = async (url: string) => {
      const pages = Taro.getCurrentPages();
      const shouldRedirect = pages.length >= 9;
      try {
        if (shouldRedirect) {
          await Taro.redirectTo({ url });
          return;
        }
        await Taro.navigateTo({ url });
      } catch {
        try {
          await Taro.redirectTo({ url });
        } catch {
          Taro.showToast({ title: '页面打开失败，请稍后重试', icon: 'none' });
        }
      }
    };

    if (title === '角色库') {
      void openLibraryPage('/subpages/warehouse/index');
      return;
    }
    if (title === '产品库') {
      void openLibraryPage('/subpages/product-library/index');
      return;
    }
    if (title === '风格库') {
      void openLibraryPage('/subpages/style-library/index');
      return;
    }
    if (title === '知识库') {
      Taro.showToast({ title: '知识库开发中', icon: 'none' });
      return;
    }
    Taro.showToast({ title: `${title} 功能开发中`, icon: 'none' });
  };

  const getMemberLevelText = (rawLevel: string | null | undefined) => {
    const lv = String(rawLevel || '').trim().toLowerCase();
    if (!lv) return '普通会员';
    if (lv.includes('diamond') || lv.includes('钻石')) return '钻石会员';
    if (lv.includes('gold') || lv.includes('黄金')) return '黄金会员';
    if (lv.includes('silver') || lv.includes('白银')) return '白银会员';
    if (lv.includes('vip') || lv.includes('pro')) return '高级会员';
    if (lv.includes('free') || lv.includes('普通')) return '普通会员';
    return String(rawLevel);
  };

  const copyProfileId = async () => {
    const id = String(profile?.id || '').trim();
    if (!id) return;
    try {
      await Taro.setClipboardData({ data: id });
      Taro.showToast({ title: 'ID已复制', icon: 'none' });
    } catch {
      // ignore
    }
  };

  const promptLogin = () => {
    Taro.navigateTo({ url: '/subpages/login/index' });
  };

  const handleChangeAvatar = async () => {
    if (!hasIdentity) {
      promptLogin();
      return;
    }
    if (updatingAvatar) return;
    try {
      const res = await Taro.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] });
      const filePath = res?.tempFilePaths?.[0];
      if (!filePath) return;

      setUpdatingAvatar(true);
      const avatarUrl = await api.uploadMedia(filePath, `avatar-${Date.now()}.jpg`, 'image/jpeg');

      const apiKey = profile?.apiKey || Taro.getStorageSync('API_KEY') || '';
      if (!apiKey) {
        throw new Error('未绑定 API Key');
      }

      await api.updateProfile({ avatarUrl });

      setProfile((prev) => ({ ...(prev || {}), avatarUrl }));

      const userInfoStr = Taro.getStorageSync('USER_INFO');
      const userInfo = userInfoStr ? JSON.parse(userInfoStr as string) : {};
      userInfo.avatarUrl = avatarUrl;
      Taro.setStorageSync('USER_INFO', JSON.stringify(userInfo));

      Taro.showToast({ title: '头像已同步到后台', icon: 'success' });
    } catch {
      Taro.showToast({ title: '头像更新失败', icon: 'none' });
    } finally {
      setUpdatingAvatar(false);
    }
  };

  const handleChangeName = async () => {
    if (!hasIdentity) {
      promptLogin();
      return;
    }
    if (updatingName) return;
    try {
      const modal = await Taro.showModal({
        title: '修改昵称',
        editable: true,
        content: profile?.username || profile?.full_name || '',
        placeholderText: '请输入新的昵称',
        confirmText: '保存',
        cancelText: '取消',
      });

      if (!modal.confirm) return;
      const username = String(modal.content || '').trim();
      if (!username) {
        Taro.showToast({ title: '昵称不能为空', icon: 'none' });
        return;
      }

      setUpdatingName(true);
      await api.updateProfile({ username, fullName: username });
      setProfile((prev) => ({ ...(prev || {}), username }));

      const userInfoStr = Taro.getStorageSync('USER_INFO');
      const userInfo = userInfoStr ? JSON.parse(userInfoStr as string) : {};
      userInfo.username = username;
      Taro.setStorageSync('USER_INFO', JSON.stringify(userInfo));

      Taro.showToast({ title: '昵称已更新', icon: 'success' });
    } catch {
      Taro.showToast({ title: '昵称更新失败', icon: 'none' });
    } finally {
      setUpdatingName(false);
    }
  };

  const handleBindApiKey = async () => {
    const modal = await Taro.showModal({
      title: '绑定 API Key',
      editable: true,
      placeholderText: '请输入你的 API Key',
      content: '',
      confirmText: '绑定',
      cancelText: '取消',
    });

    if (!modal.confirm) return false;
    const apiKey = (modal.content || '').trim();
    if (!apiKey) {
      Taro.showToast({ title: 'API Key 不能为空', icon: 'none' });
      return false;
    }

    try {
      const currentApiKey = profile?.apiKey || Taro.getStorageSync('API_KEY') || '';
      if (!currentApiKey) {
        Taro.setStorageSync('API_KEY', apiKey);
        setProfile((prev) => ({ ...(prev || {}), apiKey }));
        Taro.showToast({ title: '已绑定 API Key', icon: 'success' });
        return true;
      }

      const res = await Taro.request({
        url: `${__API_BASE_URL__}/api/user/validate-api-key`,
        method: 'POST',
        data: { apiKey },
        header: {
          'Content-Type': 'application/json',
          'X-User-Api-Key': currentApiKey,
        },
      });

      if (res.statusCode < 200 || res.statusCode >= 300) {
        throw new Error('校验失败');
      }

      const payload = res.data as { valid?: boolean; reason?: string };
      if (!payload?.valid) {
        const reason = payload?.reason === 'already_bound' ? '该 Key 已被其他账号绑定' : '无效的 API Key';
        Taro.showToast({ title: reason, icon: 'none' });
        return false;
      }

      Taro.setStorageSync('API_KEY', apiKey);
      setProfile((prev) => ({ ...(prev || {}), apiKey }));
      Taro.showToast({ title: '已绑定 API Key', icon: 'success' });
      return true;
    } catch {
      Taro.showToast({ title: '绑定失败，请重试', icon: 'none' });
      return false;
    }
  };

  const openSubpageSafely = async (url: string) => {
    const pages = Taro.getCurrentPages();
    const shouldRedirect = pages.length >= 9;
    try {
      if (shouldRedirect) {
        await Taro.redirectTo({ url });
        return;
      }
      await Taro.navigateTo({ url });
    } catch {
      try {
        await Taro.redirectTo({ url });
      } catch {
        Taro.showToast({ title: '页面打开失败，请稍后重试', icon: 'none' });
      }
    }
  };

  const ensureApiKey = async () => {
    const apiKey = profile?.apiKey || Taro.getStorageSync('API_KEY') || '';
    if (apiKey) return true;
    return handleBindApiKey();
  };

  const handlePromo = async (title: string) => {
    if (title === '算力消耗') {
      if (await ensureApiKey()) {
        await openSubpageSafely('/subpages/points-records/index');
      }
      return;
    }
    if (title === '分享有礼') {
      if (await ensureApiKey()) {
        await openSubpageSafely('/subpages/referrals/index');
      }
      return;
    }
    Taro.showToast({ title: `${title} 开发中`, icon: 'none' });
  };

  const handleSwitchLogin = () => {
    if (!hasIdentity) {
      promptLogin();
      return;
    }
    Taro.showModal({
      title: '切换登录',
      content: '确定退出当前账号并重新登录吗？',
      confirmText: '确定',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return;
        try {
          Taro.removeStorageSync('API_KEY');
          Taro.removeStorageSync('USER_INFO');
        } catch {
          // ignore
        }
        Taro.reLaunch({ url: '/subpages/login/index' });
      },
    });
  };

  return (
    <View className='profile-page'>
      <View className='profile-user-head'>
        {profile?.avatarUrl ? (
          <Image className='profile-user-avatar' src={profile.avatarUrl} mode='aspectFill' onClick={handleChangeAvatar} />
        ) : (
          <View className='profile-user-avatar profile-user-avatar--fallback' onClick={handleChangeAvatar}>
            {renderProfileIcon('avatar', 'profile-user-avatar-icon')}
          </View>
        )}
        <View className='profile-user-meta'>
          <Text className='profile-user-name' onClick={handleChangeName}>{displayName}</Text>
          <Text className='profile-user-id' onClick={copyProfileId}>ID：{displayId}</Text>
        </View>
        <View className='profile-switch-login' onClick={handleSwitchLogin}>
          <Text className='profile-switch-login-text'>{hasIdentity ? '切换登录⇆' : '去登录'}</Text>
        </View>
      </View>

      <View className='profile-hero-card'>
        <View className='profile-hero-level-row'>
          <Text className='profile-hero-level-value'>{getMemberLevelText(profile?.memberLevel)}</Text>
        </View>
        <Text className='profile-hero-points-label'>当前算力值</Text>
        <Text className='profile-hero-points-value'>{typeof profile?.points === 'number' ? profile.points : '--'}</Text>
        <View className='profile-hero-actions'>
          <View className='profile-hero-btn profile-hero-btn--primary' onClick={handleBindApiKey}>
            <Text className='profile-hero-btn-text profile-hero-btn-text--primary'>立即解锁</Text>
          </View>
          <View className='profile-hero-btn' onClick={() => setCustomerServiceOpen(true)}>
            <Text className='profile-hero-btn-text'>联系客服</Text>
          </View>
        </View>
      </View>

      <View className='profile-lib-card'>
        <View className='profile-lib-item' onClick={() => handleOpenLibrary('角色库')}>
          <View className='profile-lib-icon-shell profile-lib-icon-shell--role'>
            {renderProfileIcon('role', 'profile-lib-icon')}
          </View>
          <Text className='profile-lib-title'>角色库</Text>
          <Text className='profile-lib-count'>{overview.characters}</Text>
        </View>
        <View className='profile-lib-item' onClick={() => handleOpenLibrary('产品库')}>
          <View className='profile-lib-icon-shell profile-lib-icon-shell--product'>
            {renderProfileIcon('product', 'profile-lib-icon')}
          </View>
          <Text className='profile-lib-title'>产品库</Text>
          <Text className='profile-lib-count'>{overview.products}</Text>
        </View>
        <View className='profile-lib-item' onClick={() => handleOpenLibrary('风格库')}>
          <View className='profile-lib-icon-shell profile-lib-icon-shell--style'>
            {renderProfileIcon('style', 'profile-lib-icon')}
          </View>
          <Text className='profile-lib-title'>风格库</Text>
          <Text className='profile-lib-count'>{overview.styles}</Text>
        </View>
        <View className='profile-lib-item' onClick={() => handleOpenLibrary('知识库')}>
          <View className='profile-lib-icon-shell profile-lib-icon-shell--knowledge'>
            {renderProfileIcon('knowledge', 'profile-lib-icon')}
          </View>
          <Text className='profile-lib-title'>知识库</Text>
          <Text className='profile-lib-count'>{overview.templates}</Text>
        </View>
      </View>

      <View className='profile-promo-grid'>
        <View className='profile-promo-card' onClick={() => handlePromo('分享有礼')}>
          <View>
            <Text className='profile-promo-title'>分享有礼</Text>
            <Text className='profile-promo-desc'>分享内容赚算力值</Text>
          </View>
          <View className='profile-promo-icon-shell'>
            {renderProfileIcon('share', 'profile-promo-icon')}
          </View>
        </View>

        <View className='profile-promo-card' onClick={() => handlePromo('算力消耗')}>
          <View>
            <Text className='profile-promo-title'>算力消耗</Text>
            <Text className='profile-promo-desc'>算力扣除换权益</Text>
          </View>
          <View className='profile-promo-icon-shell'>
            {renderProfileIcon('points', 'profile-promo-icon')}
          </View>
        </View>
      </View>

      {customerServiceOpen && (
        <View className='profile-service-modal'>
          <View className='profile-service-card'>
            <Text className='profile-service-title'>联系客服</Text>
            <Text className='profile-service-subtitle'>添加咨询客服</Text>
            <View className='profile-service-qr-wrap'>
              <Image className='profile-service-qr' src={customerServiceQr} mode='aspectFit' showMenuByLongpress />
            </View>
            <View className='profile-service-tags'>
              <Text className='profile-service-tag'>答疑</Text>
              <Text className='profile-service-tag'>咨询</Text>
              <Text className='profile-service-tag'>合作</Text>
            </View>
            <Text className='profile-service-tip'>长按识别二维码，添加客服咨询</Text>
            <View className='profile-service-close' onClick={() => setCustomerServiceOpen(false)}>
              <Text className='profile-service-close-text'>我知道了</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

function renderProfileIcon(type: ProfileIconType, className: string) {
  return <Image className={className} src={PROFILE_ICONS[type]} mode='aspectFit' />;
}

function encodeSvgDataUri(svg: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg.trim())}`;
}
