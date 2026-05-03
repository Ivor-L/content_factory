import { View, Text, ScrollView, Image } from '@tarojs/components';
import Taro, { useDidShow, useLoad } from '@tarojs/taro';
import { useMemo, useState } from 'react';
import { api } from '../../utils/api';
import { miniappApi } from '../../utils/miniapp-api';
import './index.sass';

type DurationBucket = 'SHORT' | 'LONG';
type RemixScene = 'CLONE' | 'ACTION_SWAP';
type RemixStrategy = 'ONE_CLICK' | 'STORYBOARD';
type TopSwitchKey = 'SHORT' | 'LONG' | 'ACTION_SWAP';

const DURATION_BUCKETS: Array<{ key: DurationBucket; label: string; min: number; max: number }> = [
  { key: 'SHORT', label: '15s内短视频', min: 5, max: 15 },
  { key: 'LONG', label: '15s+长视频', min: 16, max: 60 },
];

const STRATEGIES: Array<{ key: RemixStrategy; title: string; desc: string }> = [
  { key: 'ONE_CLICK', title: '一键生成', desc: 'seedance2.0，效果好，但价格较高' },
  { key: 'STORYBOARD', title: '分镜生成', desc: '操控性好，性价比高' },
];

function clampDuration(value: number, bucket: DurationBucket): number {
  const conf = DURATION_BUCKETS.find((item) => item.key === bucket) || DURATION_BUCKETS[0];
  return Math.max(conf.min, Math.min(conf.max, value));
}

export default function RemixGeneratePage() {
  const [scene, setScene] = useState<RemixScene>('CLONE');
  const [characters, setCharacters] = useState<any[]>([]);
  const [selectedCharIdx, setSelectedCharIdx] = useState(0);
  const [products, setProducts] = useState<Array<{ id: string; name: string; images: string[] }>>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [referenceVideoUrl, setReferenceVideoUrl] = useState('');
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [durationBucket, setDurationBucket] = useState<DurationBucket>('SHORT');
  const [durationSeconds, setDurationSeconds] = useState(10);
  const [strategy, setStrategy] = useState<RemixStrategy>('ONE_CLICK');
  const [submitting, setSubmitting] = useState(false);

  useLoad((query) => {
    const mode = String(query?.mode || '').trim().toLowerCase();
    const referenceFromQuery = String(query?.referenceVideoUrl || query?.reference_video_url || '').trim();
    const duration = String(query?.duration || '').trim().toLowerCase();
    if (mode === 'action-swap') {
      setScene('ACTION_SWAP');
    }
    if (duration === 'long') {
      setScene('CLONE');
      setDurationBucket('LONG');
      setDurationSeconds((prev) => clampDuration(Math.max(prev, 16), 'LONG'));
    }
    if (referenceFromQuery) {
      setReferenceVideoUrl(decodeURIComponent(referenceFromQuery));
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

  const handleSwitchDurationBucket = (next: DurationBucket) => {
    if (durationBucket === next) return;
    setDurationBucket(next);
    setDurationSeconds((prev) => clampDuration(prev, next));
  };

  const getActiveTopSwitch = (): TopSwitchKey => {
    if (scene === 'ACTION_SWAP') return 'ACTION_SWAP';
    return durationBucket === 'LONG' ? 'LONG' : 'SHORT';
  };

  const handleTopSwitch = (next: TopSwitchKey) => {
    if (next === 'ACTION_SWAP') {
      setScene('ACTION_SWAP');
      return;
    }
    setScene('CLONE');
    const bucket = next === 'LONG' ? 'LONG' : 'SHORT';
    handleSwitchDurationBucket(bucket);
  };

  const changeDuration = (delta: number) => {
    setDurationSeconds((prev) => clampDuration(prev + delta, durationBucket));
  };

  const handleChooseReferenceVideo = async () => {
    const chooseRes = await Taro.chooseVideo({
      sourceType: ['album'],
      compressed: true,
    });
    if (!chooseRes?.tempFilePath) return;

    const filePath = chooseRes.tempFilePath;
    const ext = (filePath.split('.').pop() || 'mp4').toLowerCase();
    const mimeByExt: Record<string, string> = {
      mp4: 'video/mp4',
      mov: 'video/quicktime',
      m4v: 'video/mp4',
      webm: 'video/webm',
    };
    const mimeType = mimeByExt[ext] || 'video/mp4';
    const filename = `remix-reference-${Date.now()}.${ext}`;

    setUploadingVideo(true);
    try {
      const url = await api.uploadMedia(filePath, filename, mimeType);
      setReferenceVideoUrl(url);
    } catch {
      Taro.showToast({ title: '视频上传失败', icon: 'none' });
    } finally {
      setUploadingVideo(false);
    }
  };

  const submitHint = useMemo(() => {
    if (strategy === 'ONE_CLICK') {
      return durationBucket === 'SHORT' ? '预计扣除算力值 280' : '预计扣除算力值 520';
    }
    return durationBucket === 'SHORT' ? '预计扣除算力值 140' : '预计扣除算力值 260';
  }, [strategy, durationBucket]);

  const pageTitle = scene === 'ACTION_SWAP' ? '动作/角色替换' : '爆款复刻';

  const handleSubmit = async () => {
    if (!selectedCharacter) {
      Taro.showToast({ title: '请先选择角色', icon: 'none' });
      return;
    }
    if (!referenceVideoUrl) {
      Taro.showToast({ title: '请先上传参考视频', icon: 'none' });
      return;
    }

    setSubmitting(true);
    try {
      const result = await miniappApi.createStoryboardJob({
        pipelineKey: strategy === 'ONE_CLICK' ? 'viral_clone' : 'skeleton_video',
        title: `爆款复刻-${durationSeconds}s`,
        script: strategy === 'STORYBOARD' ? `参考视频复刻，目标时长${durationSeconds}秒` : '',
        productId: selectedProductId || undefined,
        source: 'miniapp_remix_generate_page',
        metadata: {
          entry: 'remix_generate_page',
          feature: 'viral_remix',
          remix_scene: scene === 'ACTION_SWAP' ? 'action_swap' : 'clone',
          duration_bucket: durationBucket,
          duration_seconds: durationSeconds,
          strategy,
          strategy_label: strategy === 'ONE_CLICK' ? 'seedance2.0' : 'storyboard',
          character_id: selectedCharacter.id,
          character_name: selectedCharacter.name || '',
          reference_video_url: referenceVideoUrl,
          selected_product_id: selectedProductId || null,
        },
      });

      if (!result.taskId) {
        throw new Error('任务创建失败，请稍后重试');
      }

      Taro.showToast({ title: '复刻任务已创建', icon: 'success' });
      Taro.navigateTo({
        url: `/subpages/storyboard-board/index?id=${encodeURIComponent(result.taskId)}&title=${encodeURIComponent('爆款复刻任务')}`,
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
            <Text className='remix-title'>{pageTitle}</Text>
          </View>
          <View className='remix-mode-tabs remix-mode-tabs--triple'>
            <View
              className={`mode-switch-tab ${getActiveTopSwitch() === 'SHORT' ? 'mode-switch-tab--active' : ''}`}
              onClick={() => handleTopSwitch('SHORT')}
            >
              <Text className='mode-switch-label'>15s内短视频</Text>
              {getActiveTopSwitch() === 'SHORT' && <View className='mode-switch-underline' />}
            </View>
            <View
              className={`mode-switch-tab ${getActiveTopSwitch() === 'LONG' ? 'mode-switch-tab--active' : ''}`}
              onClick={() => handleTopSwitch('LONG')}
            >
              <Text className='mode-switch-label'>15s+长视频</Text>
              {getActiveTopSwitch() === 'LONG' && <View className='mode-switch-underline' />}
            </View>
            <View
              className={`mode-switch-tab ${getActiveTopSwitch() === 'ACTION_SWAP' ? 'mode-switch-tab--active' : ''}`}
              onClick={() => handleTopSwitch('ACTION_SWAP')}
            >
              <Text className='mode-switch-label'>动作/角色替换</Text>
              {getActiveTopSwitch() === 'ACTION_SWAP' && <View className='mode-switch-underline' />}
            </View>
          </View>
        </View>

        <View className='section'>
          <View className='section-title-row'>
            <View className='section-title-icon section-title-icon--video' />
            <Text className='section-title'>参考视频</Text>
          </View>
          <Text className='tip-bullet'>• 特别提示：视频建议单镜头，转场视频建议拆分后分别复刻。</Text>
          <View className='upload-box' onClick={handleChooseReferenceVideo}>
            <Text className='upload-plus'>+</Text>
            <Text className='upload-text'>{referenceVideoUrl ? '已上传参考视频，点击更换' : uploadingVideo ? '上传中...' : '添加视频'}</Text>
          </View>
        </View>

        <View className='section'>
          <View className='section-title-row'>
            <View className='section-title-icon section-title-icon--role' />
            <Text className='section-title'>选择角色</Text>
          </View>
          <ScrollView scrollX className='card-scroll'>
            <View className='card-list'>
              <View className='item-card item-card--add' onClick={handleGoRoleLibrary}>
                <View className='item-add-plus'>+</View>
                <Text className='item-add-name'>添加角色</Text>
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
          <View className='section-title-row'>
            <View className='section-title-icon section-title-icon--product' />
            <Text className='section-title'>选择产品</Text>
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
