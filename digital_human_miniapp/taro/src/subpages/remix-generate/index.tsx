import { View, Text, ScrollView, Image, Video } from '@tarojs/components';
import Taro, { useDidShow, useLoad } from '@tarojs/taro';
import { useMemo, useState } from 'react';
import { api } from '../../utils/api';
import { miniappApi } from '../../utils/miniapp-api';
import './index.sass';

type DurationBucket = 'SHORT' | 'LONG';
type RemixMode = 'SMART' | 'ACTION';

function clampDuration(value: number): number {
  return Math.max(5, Math.min(60, value));
}

export default function RemixGeneratePage() {
  const [remixMode, setRemixMode] = useState<RemixMode>('SMART');
  const [products, setProducts] = useState<Array<{ id: string; name: string; images: string[] }>>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [referenceVideoUrl, setReferenceVideoUrl] = useState('');
  const [referencePreviewPath, setReferencePreviewPath] = useState('');
  const [referencePosterPath, setReferencePosterPath] = useState('');
  const [referenceFileName, setReferenceFileName] = useState('');
  const [referenceDurationSeconds, setReferenceDurationSeconds] = useState<number | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState(0);
  const [sourceImageUrl, setSourceImageUrl] = useState('');
  const [sourceImagePreviewPath, setSourceImagePreviewPath] = useState('');
  const [sourceImageFileName, setSourceImageFileName] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState(15);
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
      setReferenceDurationSeconds(null);
    }
    const mode = String(query?.mode || query?.remixMode || '').trim().toLowerCase();
    if (mode === 'action-swap' || mode === 'action' || mode === 'action-transfer') {
      setRemixMode('ACTION');
    }
  });

  useDidShow(() => {
    void (async () => {
      try {
        const productList = await miniappApi.getProducts();
        setProducts(productList);
      } catch {
        Taro.showToast({ title: '加载数据失败', icon: 'none' });
      }
    })();

    try {
      const pickedImage = Taro.getStorageSync('REMIX_ACTION_SOURCE_IMAGE_URL');
      if (typeof pickedImage === 'string' && /^https?:\/\//i.test(pickedImage.trim())) {
        const url = pickedImage.trim();
        setSourceImageUrl(url);
        setSourceImagePreviewPath(url);
        setSourceImageFileName('AI生成图片');
        Taro.removeStorageSync('REMIX_ACTION_SOURCE_IMAGE_URL');
      }
    } catch {
      // ignore storage read errors
    }
  });

  const handleBack = () => {
    const pages = Taro.getCurrentPages();
    if (pages.length > 1) {
      Taro.navigateBack({ delta: 1 });
      return;
    }
    Taro.switchTab({ url: '/pages/home/index' });
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
    const posterPath = typeof (chooseRes as { thumbTempFilePath?: string }).thumbTempFilePath === 'string'
      ? (chooseRes as { thumbTempFilePath?: string }).thumbTempFilePath || ''
      : '';
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
    setReferenceDurationSeconds(
      typeof chooseRes.duration === 'number' && Number.isFinite(chooseRes.duration)
        ? chooseRes.duration
        : null,
    );
    setReferenceVideoUrl('');
    setUploadingVideo(true);
    setVideoUploadProgress(0);
    try {
      const url = await api.uploadMedia(filePath, filename, mimeType, {
        direct: true,
        type: 'viral-remix-video',
        onProgress: setVideoUploadProgress,
      });
      setReferenceVideoUrl(url);
    } catch {
      setReferencePreviewPath('');
      setReferencePosterPath('');
      setReferenceFileName('');
      setReferenceDurationSeconds(null);
      setVideoUploadProgress(0);
      Taro.showToast({ title: '视频上传失败', icon: 'none' });
    } finally {
      setUploadingVideo(false);
    }
  };

  const handleChooseSourceImage = async () => {
    const chooseRes = await Taro.chooseImage({
      count: 1,
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
    });
    const filePath = chooseRes?.tempFilePaths?.[0];
    if (!filePath) return;

    const ext = (filePath.split('.').pop() || 'jpg').toLowerCase();
    const mimeByExt: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
    };
    const mimeType = mimeByExt[ext] || 'image/jpeg';
    const filename = `action-transfer-source-${Date.now()}.${ext}`;

    setSourceImagePreviewPath(filePath);
    setSourceImageFileName(filename);
    setSourceImageUrl('');
    setUploadingImage(true);
    try {
      const url = await api.uploadMedia(filePath, filename, mimeType);
      setSourceImageUrl(url);
      setSourceImagePreviewPath(url);
    } catch {
      setSourceImagePreviewPath('');
      setSourceImageFileName('');
      Taro.showToast({ title: '图片上传失败', icon: 'none' });
    } finally {
      setUploadingImage(false);
    }
  };

  const handleGoAiImage = () => {
    Taro.navigateTo({ url: '/subpages/image-generate/index?from=action-transfer' });
  };

  const submitHint = useMemo(() => {
    if (remixMode === 'ACTION') return '预计扣除算力值 280';
    const durationBucket: DurationBucket = durationSeconds > 15 ? 'LONG' : 'SHORT';
    return durationBucket === 'SHORT' ? '预计扣除算力值 280' : '预计扣除算力值 520';
  }, [remixMode, durationSeconds]);

  const handleSubmit = async () => {
    if (remixMode === 'ACTION') {
      if (!sourceImageUrl) {
        Taro.showToast({ title: '请先上传图片', icon: 'none' });
        return;
      }
      if (!referenceVideoUrl) {
        Taro.showToast({ title: '请先上传参考视频', icon: 'none' });
        return;
      }

      setSubmitting(true);
      try {
        const result = await api.createActionTransferTask({
          imageUrl: sourceImageUrl,
          videoUrl: referenceVideoUrl,
          durationSeconds: referenceDurationSeconds,
        });
        Taro.showToast({ title: '动作复刻任务已创建', icon: 'success' });
        Taro.navigateTo({ url: `/subpages/records/index?id=${encodeURIComponent(result.id)}` });
      } catch (error) {
        Taro.showToast({ title: (error as Error).message || '提交失败', icon: 'none' });
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!referenceVideoUrl) {
      Taro.showToast({ title: '请先上传参考视频', icon: 'none' });
      return;
    }

    setSubmitting(true);
    try {
      const result = await miniappApi.createStoryboardJob({
        pipelineKey: 'viral_clone',
        title: `一键复刻-${durationSeconds}s`,
        script: `参考视频爆款复刻，目标时长${durationSeconds}秒。第一阶段拆解参考视频，第二阶段替换用户选择的产品，第三阶段生成视频。`,
        productId: selectedProductId || undefined,
        source: 'miniapp_remix_generate_page',
        metadata: {
          entry: 'remix_generate_page',
          feature: 'viral_remix',
          title: `一键复刻-${durationSeconds}s`,
          remix_scene: 'one_click_remix',
          duration_bucket: durationSeconds > 15 ? 'LONG' : 'SHORT',
          duration_seconds: durationSeconds,
          person_reference_imported: false,
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
            <Text className='remix-title'>爆款复刻</Text>
          </View>
          <View className='remix-scene-tabs'>
            <View
              className={`remix-scene-tab ${remixMode === 'SMART' ? 'remix-scene-tab--active' : ''}`}
              onClick={() => setRemixMode('SMART')}
            >
              <Text className='remix-scene-tab-text'>智能复刻</Text>
              {remixMode === 'SMART' && <View className='remix-scene-underline' />}
            </View>
            <View
              className={`remix-scene-tab ${remixMode === 'ACTION' ? 'remix-scene-tab--active' : ''}`}
              onClick={() => setRemixMode('ACTION')}
            >
              <Text className='remix-scene-tab-text'>动作复刻</Text>
              {remixMode === 'ACTION' && <View className='remix-scene-underline' />}
            </View>
          </View>
        </View>

        {remixMode === 'ACTION' && (
          <View className='section'>
            <View className='section-title-row section-title-row--between'>
              <View className='section-title-main'>
                <View className='section-title-icon section-title-icon--image' />
                <Text className='section-title'>上传图片</Text>
              </View>
              <View className='section-add-btn' onClick={handleGoAiImage}>
                <Text className='section-add-btn-text'>用AI生成图片</Text>
              </View>
            </View>
            {sourceImagePreviewPath ? (
              <View
                className='upload-preview-card upload-preview-card--image upload-preview-card--action-media'
                onClick={handleChooseSourceImage}
              >
                <View className='upload-preview-stage upload-preview-stage--image upload-preview-stage--action-media'>
                  <Image className='upload-preview-image' src={sourceImagePreviewPath} mode='aspectFit' />
                  {uploadingImage && (
                    <View className='upload-preview-overlay'>
                      <View className='upload-spinner' />
                      <Text className='upload-preview-status'>上传中...</Text>
                    </View>
                  )}
                </View>
                <View className='upload-preview-footer'>
                  <Text className='upload-preview-name'>{sourceImageFileName || '图片'}</Text>
                  <Text className='upload-preview-change'>{uploadingImage ? '请稍候' : '更换'}</Text>
                </View>
              </View>
            ) : (
              <View className='upload-box upload-box--action-media' onClick={handleChooseSourceImage}>
                {uploadingImage ? <View className='upload-spinner upload-spinner--box' /> : <Text className='upload-plus'>+</Text>}
                <Text className='upload-text'>{uploadingImage ? '上传中...' : '添加图片'}</Text>
              </View>
            )}
          </View>
        )}

        <View className='section'>
          <View className='section-title-row'>
            <View className='section-title-icon section-title-icon--video' />
            <Text className='section-title'>参考视频</Text>
          </View>
          {referencePreviewPath ? (
            <View
              className={`upload-preview-card ${remixMode === 'ACTION' ? 'upload-preview-card--action-media' : ''}`}
              onClick={handleChooseReferenceVideo}
            >
              <View className={`upload-preview-stage ${remixMode === 'ACTION' ? 'upload-preview-stage--action-media' : ''}`}>
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
                    <Text className='upload-preview-status'>上传中 {videoUploadProgress}%</Text>
                  </View>
                )}
              </View>
              <View className='upload-preview-footer'>
                <Text className='upload-preview-name'>{referenceFileName || '参考视频'}</Text>
                <Text className='upload-preview-change'>{uploadingVideo ? '请稍候' : '更换'}</Text>
              </View>
            </View>
          ) : (
            <View
              className={`upload-box ${remixMode === 'ACTION' ? 'upload-box--action-media' : ''}`}
              onClick={handleChooseReferenceVideo}
            >
              {uploadingVideo ? <View className='upload-spinner upload-spinner--box' /> : <Text className='upload-plus'>+</Text>}
              <Text className='upload-text'>{uploadingVideo ? `上传中 ${videoUploadProgress}%` : '添加视频'}</Text>
            </View>
          )}
        </View>

        {remixMode === 'SMART' && (
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
        )}

        {remixMode === 'SMART' && (
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
        )}

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
