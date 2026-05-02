import { View, Text, Video, Image } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useCallback, useState } from 'react';
import { miniappApi } from '../../utils/miniapp-api';
import antHeadLogo from '../../assets/icons/ant-head-logo-small.jpg';
import videoIcon from '../../assets/home-icons-v2/video.png';
import imageIcon from '../../assets/home-icons-v2/image.png';
import swapIcon from '../../assets/home-icons-v2/swap.png';
import humanIcon from '../../assets/home-icons-v2/human.png';
import './index.sass';

const HERO_VIDEO_ID = 'homeHeroVideo';
const REMIX_VIDEO_ID = 'homeRemixVideo';
const HERO_VIDEO_OSS_URL = 'https://oss.atomx.top/miniapp/home/hero-1777626035392.mp4';
const HERO_POSTER_OSS_URL = 'https://oss.atomx.top/miniapp/home/hero-poster-1777627846532.jpg';
const REMIX_COVER_OSS_URL = 'https://oss.atomx.top/miniapp/hot-square/fallback-cover-1777628403821.jpg';
const REMIX_VIDEO_URLS = [
  'https://oss.atomx.top/miniapp/home/remix-pixar-1777640495240.mp4',
  'https://oss.atomx.top/miniapp/home/remix-skincare-1777640495240.mp4',
  'https://oss.atomx.top/miniapp/home/remix-zopia-showcase-4s-1777640844679.mp4',
];

export default function HomePage() {
  const [profile, setProfile] = useState<any>(null);
  const [heroVideoFailed, setHeroVideoFailed] = useState(false);
  const [heroVideoSrc] = useState(HERO_VIDEO_OSS_URL);
  const [remixVideoFailed, setRemixVideoFailed] = useState(false);
  const [remixVideoIndex, setRemixVideoIndex] = useState(0);

  const playHeroVideo = useCallback(() => {
    const ctx = Taro.createVideoContext(HERO_VIDEO_ID);
    try {
      ctx.play();
    } catch {
      // noop
    }
  }, []);

  useDidShow(() => {
    void (async () => {
      try {
        const data = await miniappApi.getProfile();
        setProfile(data);
      } catch {
        // Keep page usable even if profile request fails.
      }
    })();

    setTimeout(() => playHeroVideo(), 180);
  });

  return (
    <View className='home-page'>
      <View className='home-hero'>
        <Video
          id={HERO_VIDEO_ID}
          className='home-hero-video'
          src={heroVideoSrc}
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
          onLoadedData={playHeroVideo}
          onLoadedMetaData={playHeroVideo}
          onError={() => {
            setHeroVideoFailed(true);
            Taro.showToast({ title: '顶部视频加载失败，已切换封面图', icon: 'none' });
          }}
        />
        {heroVideoFailed && <Image className='home-hero-fallback' src={HERO_POSTER_OSS_URL} mode='aspectFill' />}
        <View className='home-hero-mask' />
        <View className='home-hero-fade' />
        <View className='home-hero-content'>
          <View className='home-hero-title-chip'>
            <Image className='home-hero-title-logo' src={antHeadLogo} mode='aspectFill' />
            <Text className='home-hero-title-chip-text'>小蚁AI</Text>
          </View>
          <Text className='home-hero-main-title'>让内容营销更简单</Text>
        </View>
      </View>

      <View
        className='home-remix-card'
        onClick={() => Taro.navigateTo({ url: '/pages/remix-generate/index' })}
      >
        {!remixVideoFailed && (
          <Video
            id={REMIX_VIDEO_ID}
            className='home-remix-video'
            src={REMIX_VIDEO_URLS[remixVideoIndex]}
            poster={REMIX_COVER_OSS_URL}
            autoplay
            loop={false}
            muted
            controls={false}
            showPlayBtn={false}
            showCenterPlayBtn={false}
            showFullscreenBtn={false}
            enablePlayGesture={false}
            objectFit='cover'
            initialTime={0}
            onEnded={() => {
              setRemixVideoIndex((prev) => (prev + 1) % REMIX_VIDEO_URLS.length);
            }}
            onError={() => {
              setRemixVideoFailed(true);
            }}
          />
        )}
        {remixVideoFailed && <Image className='home-remix-cover' src={REMIX_COVER_OSS_URL} mode='aspectFill' />}
        <View className='home-remix-mask' />
        <View className='home-remix-content'>
          <Text className='home-remix-title'>复刻爆款视频</Text>
          <Text className='home-remix-desc'>一键生成你的同款大片</Text>
          <View className='home-remix-btn'>
            <Text className='home-remix-btn-text'>做同款</Text>
          </View>
        </View>
      </View>

      <View className='home-feature-grid'>
        <View className='home-feature-card home-feature-card--video' onClick={() => Taro.navigateTo({ url: '/pages/generate/index?feature=digital-human' })}>
          <View className='home-feature-head'>
            <Text className='home-feature-title'>AI数字人</Text>
          </View>
          <Text className='home-feature-desc'>数字人视频生成</Text>
          <Image className='home-card-icon home-card-icon--video' src={humanIcon} mode='aspectFit' />
        </View>

        <View className='home-feature-right'>
          <View className='home-feature-card home-feature-card--image' onClick={() => Taro.navigateTo({ url: '/pages/image-generate/index' })}>
            <Text className='home-feature-title'>图片生成</Text>
            <Text className='home-feature-desc'>文生图 / 图生图</Text>
            <Image className='home-card-icon home-card-icon--small' src={imageIcon} mode='aspectFit' />
          </View>
          <View className='home-feature-card home-feature-card--edit' onClick={() => Taro.navigateTo({ url: '/pages/generate/index?feature=video-generate&category=skeleton-3d' })}>
            <Text className='home-feature-title'>视频生成</Text>
            <Text className='home-feature-desc'>文生视频、图生视频</Text>
            <Image className='home-card-icon home-card-icon--small' src={videoIcon} mode='aspectFit' />
          </View>
        </View>
      </View>

      <View className='home-action-row' onClick={() => Taro.navigateTo({ url: '/pages/monetization-square/index' })}>
        <View>
          <Text className='home-action-title'>变现广场</Text>
          <Text className='home-action-desc'>精选高变现内容模板，一键做同款</Text>
        </View>
        <Image className='home-card-icon home-card-icon--action' src={swapIcon} mode='aspectFit' />
      </View>

    </View>
  );
}
