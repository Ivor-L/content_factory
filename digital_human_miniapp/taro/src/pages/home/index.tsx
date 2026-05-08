import { View, Text, Video, Image } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useCallback, useState } from 'react';
import { miniappApi } from '../../utils/miniapp-api';
import antHeadLogo from '../../assets/icons/ant-head-logo-small.jpg';
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
const IMAGE_ICON_SVG = encodeSvgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#111111" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/>
  <circle cx="8.5" cy="9" r="1.5"/>
  <path d="m5 17 4.5-4.5 3.5 3.5 2.5-2.5L19 17"/>
</svg>
`);
const VIDEO_ICON_SVG = encodeSvgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#111111" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <rect x="3.5" y="5" width="17" height="14" rx="2.5"/>
  <path d="m10 9 5 3-5 3V9Z"/>
</svg>
`);
const COPY_ICON_SVG = encodeSvgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#111111" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M8 4.5h7.2l3.3 3.3v11.7H8z"/>
  <path d="M15 4.5V8h3.5"/>
  <path d="M5.5 7.5v12h9"/>
  <path d="M10.8 12h5"/>
  <path d="M10.8 15h4"/>
</svg>
`);

type HomeFlatIcon = 'human' | 'image' | 'video' | 'coin' | 'copy';

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
        onClick={() => Taro.navigateTo({ url: '/subpages/remix-generate/index' })}
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
            <Text className='home-remix-btn-text'>一键创作</Text>
          </View>
        </View>
      </View>

        <View className='home-feature-grid'>
        <View className='home-feature-card home-feature-card--video' onClick={() => Taro.navigateTo({ url: '/subpages/generate/index?feature=digital-human' })}>
          <View className='home-card-icon-shell home-card-icon-shell--large'>
            {renderHomeFlatIcon('human')}
          </View>
          <Text className='home-card-arrow'>↗</Text>
          <Text className='home-feature-title home-feature-title--large'>AI数字人</Text>
        </View>

        <View className='home-feature-right'>
          <View className='home-feature-card home-feature-card--image' onClick={() => Taro.navigateTo({ url: '/subpages/image-generate/index' })}>
            <View className='home-card-icon-shell'>
              {renderHomeFlatIcon('image')}
            </View>
            <Text className='home-card-arrow'>↗</Text>
            <Text className='home-feature-title'>图片生成</Text>
          </View>
          <View className='home-feature-card home-feature-card--edit' onClick={() => Taro.navigateTo({ url: '/subpages/generate/index?feature=video-generate&category=skeleton-3d' })}>
            <View className='home-card-icon-shell'>
              {renderHomeFlatIcon('video')}
            </View>
            <Text className='home-card-arrow'>↗</Text>
            <Text className='home-feature-title'>视频生成</Text>
          </View>
        </View>
      </View>

      <View className='home-action-row home-action-row--smart-copy' onClick={() => Taro.navigateTo({ url: '/subpages/smart-copy/index' })}>
        <View className='home-card-icon-shell home-card-icon-shell--coin'>
          {renderHomeFlatIcon('copy')}
        </View>
        <Text className='home-card-arrow'>↗</Text>
        <Text className='home-action-title'>智能文案</Text>
      </View>

    </View>
  );
}

function renderHomeFlatIcon(type: HomeFlatIcon) {
  if (type === 'human') {
    return (
      <View className='home-flat-icon home-flat-icon--human'>
        <View className='home-flat-human-head' />
        <View className='home-flat-human-body' />
      </View>
    );
  }

  if (type === 'image') {
    return (
      <Image className='home-flat-icon home-flat-icon-image' src={IMAGE_ICON_SVG} mode='aspectFit' />
    );
  }

  if (type === 'video') {
    return (
      <Image className='home-flat-icon home-flat-icon-image' src={VIDEO_ICON_SVG} mode='aspectFit' />
    );
  }

  if (type === 'copy') {
    return (
      <Image className='home-flat-icon home-flat-icon-image' src={COPY_ICON_SVG} mode='aspectFit' />
    );
  }

  return (
    <Text className='home-flat-yen'>¥</Text>
  );
}

function encodeSvgDataUri(svg: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg.trim())}`;
}
