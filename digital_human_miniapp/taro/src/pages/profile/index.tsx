import { View, Text, Image } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useState } from 'react';
import { miniappApi } from '../../utils/miniapp-api';
import { api } from '../../utils/api';
import avatarIcon from '../../assets/icons/human-silhouette.jpg';
import roleLibIcon from '../../assets/icons/profile-lib-role.png';
import productLibIcon from '../../assets/icons/profile-lib-product.png';
import styleLibIcon from '../../assets/icons/profile-lib-style.png';
import knowledgeLibIcon from '../../assets/icons/profile-lib-knowledge.png';
import promoShareIcon from '../../assets/icons/promo-share.png';
import promoPointsIcon from '../../assets/icons/promo-points.png';
import './index.sass';

export default function ProfilePage() {
  const [profile, setProfile] = useState<any>(null);
  const [updatingAvatar, setUpdatingAvatar] = useState(false);
  const [updatingName, setUpdatingName] = useState(false);
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
        <Image className='profile-user-avatar' src={profile?.avatarUrl || avatarIcon} mode='aspectFill' onClick={handleChangeAvatar} />
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
          <View className='profile-hero-btn' onClick={() => Taro.showToast({ title: '客服功能开发中', icon: 'none' })}>
            <Text className='profile-hero-btn-text'>联系客服</Text>
          </View>
        </View>
      </View>

      <View className='profile-lib-card'>
        <View className='profile-lib-item' onClick={() => handleOpenLibrary('角色库')}>
          <Image className='profile-lib-icon' src={roleLibIcon} mode='aspectFit' />
          <Text className='profile-lib-title'>角色库</Text>
          <Text className='profile-lib-count'>{overview.characters}</Text>
        </View>
        <View className='profile-lib-item' onClick={() => handleOpenLibrary('产品库')}>
          <Image className='profile-lib-icon' src={productLibIcon} mode='aspectFit' />
          <Text className='profile-lib-title'>产品库</Text>
          <Text className='profile-lib-count'>{overview.products}</Text>
        </View>
        <View className='profile-lib-item' onClick={() => handleOpenLibrary('风格库')}>
          <Image className='profile-lib-icon' src={styleLibIcon} mode='aspectFit' />
          <Text className='profile-lib-title'>风格库</Text>
          <Text className='profile-lib-count'>{overview.styles}</Text>
        </View>
        <View className='profile-lib-item' onClick={() => handleOpenLibrary('知识库')}>
          <Image className='profile-lib-icon' src={knowledgeLibIcon} mode='aspectFit' />
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
          <Image className='profile-promo-icon' src={promoShareIcon} mode='aspectFit' />
        </View>

        <View className='profile-promo-card' onClick={() => handlePromo('算力消耗')}>
          <View>
            <Text className='profile-promo-title'>算力消耗</Text>
            <Text className='profile-promo-desc'>算力扣除换权益</Text>
          </View>
          <Image className='profile-promo-icon' src={promoPointsIcon} mode='aspectFit' />
        </View>
      </View>
    </View>
  );
}
