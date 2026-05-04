import { View, Text, ScrollView, Image, Video } from '@tarojs/components';
import Taro, { useDidShow, useLoad } from '@tarojs/taro';
import { useMemo, useState } from 'react';
import { api } from '../../utils/api';
import { miniappApi } from '../../utils/miniapp-api';
import './index.sass';

type DurationBucket = 'SHORT' | 'LONG';
type RemixStrategy = 'ONE_CLICK' | 'STORYBOARD';

const STRATEGIES: Array<{ key: RemixStrategy; title: string; desc: string }> = [
  { key: 'ONE_CLICK', title: '一键生成', desc: '基于 seedance2.0 生成，效果好，但价格较高' },
  { key: 'STORYBOARD', title: '分镜控制', desc: '基于 veo3.0 生成，操控性好，性价比高' },
];

function clampDuration(value: number): number {
  return Math.max(5, Math.min(60, value));
}

export default function RemixGeneratePage() {
  const [characters, setCharacters] = useState<any[]>([]);
  const [selectedCharIdx, setSelectedCharIdx] = useState(-1);
  const [products, setProducts] = useState<Array<{ id: string; name: string; images: string[] }>>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [referenceVideoUrl, setReferenceVideoUrl] = useState('');
  const [referencePreviewPath, setReferencePreviewPath] = useState('');
  const [referencePosterPath, setReferencePosterPath] = useState('');
  const [referenceFileName, setReferenceFileName] = useState('');
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState(10);
  const [strategy, setStrategy] = useState<RemixStrategy>('ONE_CLICK');
  const [submitting, setSubmitting] = useState(false);

  useLoad((query) => {
    const referenceFromQuery = String(query?.referenceVideoUrl || query?.reference_video_url || '').trim();
    const duration = String(query?.duration || '').trim().toLowerCase();
    if (duration === 'long') {
      setDurationSeconds((prev) => clampDuration(Math.max(prev, 16)));
    }
    if (referenceFromQuery) {
      setReferenceVideoUrl(decodeURIComponent(referenceFromQuery));
      setReferencePreviewPath(decodeURIComponent(referenceFromQuery));
    }
  });

  useDidShow(() => {
    void (async () => {
      try {
        const [roleList, productList] = await Promise.all([
          api.getDigitalHumans(),
          miniappApi.getProducts(),
        ]);
        setCharacters(roleList);
        setProducts(productList);
      } catch {
        Taro.showToast({ title: '加载数据失败', icon: 'none' });
      }
    })();
  });

  const selectedCharacter = characters[selectedCharIdx];

  const handleBack = () => {
    const pages = Taro.getCurrentPages();
    if (pages.length > 1) {
      Taro.navigateBack({ delta: 1 });
      return;
    }
    Taro.switchTab({ url: '/pages/home/index' });
  };

  const handleGoRoleLibrary = () => {
    Taro.navigateTo({ url: '/subpages/warehouse/index' });
  };

  const handleGoProductLibrary = () => {
    Taro.navigateTo({ url: '/subpages/product-library/index' });
  };

  const changeDuration = (delta: number) => {
    setDurationSeconds((prev) => clampDuration(prev + delta));
  };

  const handleChooseReferenceVideo = async () => {
    const chooseRes = await Taro.chooseVideo({
      sourceType: ['album'],
      compressed: true,
    });
    if (!chooseRes?.tempFilePath) return;

    const filePath = chooseRes.tempFilePath;
    const posterPath = typeof chooseRes.thumbTempFilePath === 'string' ? chooseRes.thumbTempFilePath : '';
    const ext = (filePath.split('.').pop() || 'mp4').toLowerCase();
    const mimeByExt: Record<string, string> = {
      mp4: 'video/mp4',
      mov: 'video/quicktime',
      m4v: 'video/mp4',
      webm: 'video/webm',
    };
    const mimeType = mimeByExt[ext] || 'video/mp4';
    const filename = `remix-reference-${Date.now()}.${ext}`;

    setReferencePreviewPath(filePath);
    setReferencePosterPath(posterPath);
    setReferenceFileName(filename);
    setReferenceVideoUrl('');
    setUploadingVideo(true);
    try {
      const url = await api.uploadMedia(filePath, filename, mimeType);
      setReferenceVideoUrl(url);
    } catch {
      setReferencePreviewPath('');
      setReferencePosterPath('');
      setReferenceFileName('');
      Taro.showToast({ title: '视频上传失败', icon: 'none' });
    } finally {
      setUploadingVideo(false);
    }
  };

  const submitHint = useMemo(() => {
    const durationBucket: DurationBucket = durationSeconds > 15 ? 'LONG' : 'SHORT';
    if (strategy === 'ONE_CLICK') {
      return durationBucket === 'SHORT' ? '预计扣除算力值 280' : '预计扣除算力值 520';
    }
    return durationBucket === 'SHORT' ? '预计扣除算力值 140' : '预计扣除算力值 260';
  }, [strategy, durationSeconds]);

  const handleSubmit = async () => {
    if (!referenceVideoUrl) {
      Taro.showToast({ title: '请先上传参考视频', icon: 'none' });
      return;
    }

    setSubmitting(true);
    try {
      const durationBucket: DurationBucket = durationSeconds > 15 ? 'LONG' : 'SHORT';
      const result = await miniappApi.createStoryboardJob({
        pipelineKey: 'viral_clone',
        title: `一键复刻-${durationSeconds}s`,
        script: `参考视频爆款复刻，目标时长${durationSeconds}秒。第一阶段拆解参考视频，第二阶段替换产品或角色，第三阶段生成视频。`,
        productId: selectedProductId || undefined,
        characterId: selectedCharacter?.id || undefined,
        source: 'miniapp_remix_generate_page',
        metadata: {
          entry: 'remix_generate_page',
          feature: 'viral_remix',
          title: `一键复刻-${durationSeconds}s`,
          remix_scene: 'one_click_remix',
          duration_bucket: durationBucket,
          duration_seconds: durationSeconds,
          strategy,
          strategy_label: strategy === 'ONE_CLICK' ? 'seedance2.0' : 'veo3.0',
          generation_model: strategy === 'ONE_CLICK' ? 'seedance2.0' : 'veo3.0',
          character_id: selectedCharacter?.id || null,
          character_name: selectedCharacter?.name || '',
          reference_video_url: referenceVideoUrl,
          reference_video_poster: referencePosterPath || null,
          reference_video_filename: referenceFileName || null,
          selected_product_id: selectedProductId || null,
        },
      });

      if (!result.taskId) {
        throw new Error('任务创建失败，请稍后重试');
      }

      Taro.showToast({ title: '复刻任务已创建', icon: 'success' });
      Taro.navigateTo({
        url: `/subpages/storyboard-board/index?id=${encodeURIComponent(result.taskId)}&title=${encodeURIComponent('一键复刻')}`,
      });
    } catch (error) {
      Taro.showToast({ title: (error as Error).message || '提交失败', icon: 'none' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <ScrollView scrollY className='remix-page'>
        <View className='remix-header'>
          <View className='remix-topbar'>
            <View className='remix-back' onClick={handleBack}>
              <Text className='remix-back-text'>‹</Text>
            </View>
            <Text className='remix-title'>一键复刻</Text>
          </View>
        </View>

        <View className='section'>
          <View className='section-title-row'>
            <View className='section-title-icon section-title-icon--video' />
            <Text className='section-title'>参考视频</Text>
          </View>
          {referencePreviewPath ? (
            <View className='upload-preview-card' onClick={handleChooseReferenceVideo}>
              <View className='upload-preview-stage'>
                {referencePosterPath ? (
                  <Image className='upload-preview-image' src={referencePosterPath} mode='aspectFit' />
                ) : (
                  <Video
                    className='upload-preview-video'
                    src={referencePreviewPath}
                    controls={false}
                    autoplay={false}
                    muted
                    showCenterPlayBtn={false}
                    showFullscreenBtn={false}
                    objectFit='contain'
                  />
                )}
                {uploadingVideo && (
                  <View className='upload-preview-overlay'>
                    <View className='upload-spinner' />
                    <Text className='upload-preview-status'>上传中...</Text>
                  </View>
                )}
              </View>
              <View className='upload-preview-footer'>
                <Text className='upload-preview-name'>{referenceFileName || '参考视频'}</Text>
                <Text className='upload-preview-change'>{uploadingVideo ? '请稍候' : '更换'}</Text>
              </View>
            </View>
          ) : (
            <View className='upload-box' onClick={handleChooseReferenceVideo}>
              {uploadingVideo ? <View className='upload-spinner upload-spinner--box' /> : <Text className='upload-plus'>+</Text>}
              <Text className='upload-text'>{uploadingVideo ? '上传中...' : '添加视频'}</Text>
            </View>
          )}
        </View>

        <View className='section'>
          <View className='section-title-row section-title-row--between'>
            <View className='section-title-main'>
              <View className='section-title-icon section-title-icon--role' />
              <Text className='section-title'>选择角色</Text>
            </View>
            <View className='section-add-btn' onClick={handleGoRoleLibrary}>
              <Text className='section-add-btn-text'>添加角色</Text>
            </View>
          </View>
          <ScrollView scrollX className='card-scroll'>
            <View className='card-list'>
              <View
                className={`item-card ${selectedCharIdx < 0 ? 'item-card--active' : ''}`}
                onClick={() => setSelectedCharIdx(-1)}
              >
                <View className='item-avatar item-avatar--option'>
                  <View className='item-option-icon' />
                </View>
                <Text className='item-name'>不使用角色</Text>
              </View>
              {characters.map((char, idx) => (
                <View
                  key={char.id ?? idx}
                  className={`item-card ${idx === selectedCharIdx ? 'item-card--active' : ''}`}
                  onClick={() => setSelectedCharIdx(idx)}
                >
                  <Image className='item-avatar' src={char.imageUrl} mode='aspectFill' />
                  <Text className='item-name'>{char.name || `角色${idx + 1}`}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
          {characters.length === 0 && <Text className='hint-text'>暂无角色，请先在形象库添加。</Text>}
        </View>

        <View className='section'>
          <View className='section-title-row section-title-row--between'>
            <View className='section-title-main'>
              <View className='section-title-icon section-title-icon--product' />
              <Text className='section-title'>选择产品</Text>
            </View>
            <View className='section-add-btn' onClick={handleGoProductLibrary}>
              <Text className='section-add-btn-text'>添加产品</Text>
            </View>
          </View>
          <ScrollView scrollX className='card-scroll'>
            <View className='card-list'>
              <View
                className={`item-card ${selectedProductId === '' ? 'item-card--active' : ''}`}
                onClick={() => setSelectedProductId('')}
              >
                <View className='item-avatar item-avatar--option'>
                  <View className='item-option-icon' />
                </View>
                <Text className='item-name'>不使用产品</Text>
              </View>
              {products.map((product) => (
                <View
                  key={product.id}
                  className={`item-card ${selectedProductId === product.id ? 'item-card--active' : ''}`}
                  onClick={() => setSelectedProductId(product.id)}
                >
                  {product.images?.[0] ? (
                    <Image className='item-avatar' src={product.images[0]} mode='aspectFill' />
                  ) : (
                    <View className='item-avatar' />
                  )}
                  <Text className='item-name'>{product.name}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>

        <View className='section'>
          <View className='section-title-row'>
            <View className='section-title-icon section-title-icon--clock' />
            <Text className='section-title'>时长选择</Text>
          </View>
          <View className='duration-stepper'>
            <View className='step-btn' onClick={() => changeDuration(-1)}>
              <Text className='step-btn-text'>-</Text>
            </View>
            <Text className='step-value'>{durationSeconds}</Text>
            <Text className='step-unit'>秒</Text>
            <View className='step-btn' onClick={() => changeDuration(1)}>
              <Text className='step-btn-text'>+</Text>
            </View>
          </View>
        </View>

        <View className='section'>
          <View className='section-title-row'>
            <View className='section-title-icon section-title-icon--strategy' />
            <Text className='section-title'>复刻策略</Text>
          </View>
          <View className='strategy-grid'>
            {STRATEGIES.map((item) => (
              <View
                key={item.key}
                className={`strategy-card ${strategy === item.key ? 'strategy-card--active' : ''}`}
                onClick={() => setStrategy(item.key)}
              >
                <Text className='strategy-title'>{item.title}</Text>
                <Text className='strategy-desc'>{item.desc}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <View className='fixed-submit-bar'>
        <View className='fixed-submit'>
          <Text className='fixed-submit-sub'>{submitHint}</Text>
          <View className={`submit-btn ${submitting ? 'submit-btn--disabled' : ''}`} onClick={handleSubmit}>
            <Text className='submit-btn-text'>{submitting ? '生成中...' : '立即生成'}</Text>
          </View>
        </View>
      </View>
    </>
  );
}
