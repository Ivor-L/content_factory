import { View, Text, Image, ScrollView, Swiper, SwiperItem, Video } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { useEffect, useMemo, useState } from 'react';
import { miniappApi } from '../../utils/miniapp-api';
import './index.sass';

const VIDEO_URL_RE = /\.(mp4|mov|m3u8)(\?|$)|\/video\/|\/master\/|xgvideo/i;
const HTTP_URL_RE = /^https?:\/\//i;
const API_BASE_URL = getApiBaseUrl();
const ACTION_TRANSFER_IMAGE_RETURN_KEY = 'REMIX_ACTION_SOURCE_IMAGE_URL';
const WORK_SELECT_TARGET_STORAGE_KEY = 'WORK_SELECT_TARGET';
const DETAIL_IMAGE_WIDTH_RPX = 702;
const DETAIL_IMAGE_FALLBACK_HEIGHT_RPX = 936;
const SMART_COPY_CARD_PAYLOAD_KEY = 'SMART_COPY_CARD_PAYLOAD';
const SMART_COPY_SCRIPT_PAYLOAD_KEY = 'SMART_COPY_SCRIPT_PAYLOAD';

function buildQrcodeImageSrc(text: string): string {
  const value = String(text || '').trim();
  if (!value) return '';
  if (/^https?:\/\/.+\.(png|jpe?g|webp)(\?|$)/i.test(value) || /^data:image\//i.test(value)) return value;
  const path = `/api/utils/qrcode?size=360&text=${encodeURIComponent(value)}`;
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}

type WorkSelectTarget = {
  target: 'action-transfer';
  storageKey: string;
  backUrl: string;
};

export default function WorkDetailPage() {
  const [item, setItem] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [currentPosterIndex, setCurrentPosterIndex] = useState(0);
  const [selectTarget, setSelectTarget] = useState<WorkSelectTarget | null>(null);
  const [posterRatioMap, setPosterRatioMap] = useState<Record<string, number>>({});

  useLoad((query) => {
    const cached = normalizeStoredWorkDetailItem(Taro.getStorageSync('WORK_DETAIL_ITEM'));
    if (cached && (!query?.id || String(cached.id) === String(query.id))) {
      setItem(cached);
      if (isCopyWork(cached)) {
        void hydrateSmartCopyDetail(cached);
      }
    }
    const target = Taro.getStorageSync(WORK_SELECT_TARGET_STORAGE_KEY);
    if (
      target &&
      typeof target === 'object' &&
      target.target === 'action-transfer' &&
      typeof target.storageKey === 'string'
    ) {
      setSelectTarget({
        target: 'action-transfer',
        storageKey: target.storageKey || ACTION_TRANSFER_IMAGE_RETURN_KEY,
        backUrl: typeof target.backUrl === 'string' && target.backUrl ? target.backUrl : '/subpages/remix-generate/index?mode=action-transfer',
      });
    }
  });

  const hydrateSmartCopyDetail = async (current: Record<string, unknown>) => {
    const taskId = String(current.taskId || current.id || '').trim();
    if (!taskId) return;
    try {
      const detail = await miniappApi.getSmartCopyTask(taskId);
      const generatedText = String(detail.generatedText || '').trim();
      const generatedTitle = String(detail.generatedTitle || detail.title || '').trim();
      const metadata = current.metadata && typeof current.metadata === 'object'
        ? current.metadata as Record<string, unknown>
        : {};
      const next = {
        ...current,
        title: generatedTitle || current.title || '智能文案',
        status: detail.status || current.status,
        preview: generatedText || current.preview || '',
        metadata: {
          ...metadata,
          generatedText: generatedText || metadata.generatedText,
          generatedTitle: generatedTitle || metadata.generatedTitle,
          tags: detail.tags,
        },
      };
      setItem(next);
      Taro.setStorageSync('WORK_DETAIL_ITEM', next);
    } catch {
      // Keep the summary item if detail refresh fails.
    }
  };

  const posterImages = useMemo<string[]>(() => getPosterImages(item), [item]);

  const coverUrl = useMemo<string | null>(() => {
    if (posterImages.length > 0) return posterImages[0];
    const thumb = typeof item?.thumbnailUrl === 'string' ? item.thumbnailUrl.trim() : '';
    if (thumb) return thumb;
    const preview = typeof item?.preview === 'string' ? item.preview.trim() : '';
    if (preview && /\.(jpg|jpeg|png|webp)(\?|$)/i.test(preview)) {
      return preview;
    }
    return null;
  }, [item, posterImages]);

  const isImageText = item?.type === 'image-text';
  const isCopy = isCopyWork(item);
  const videoUrl = useMemo(() => resolveVideoUrlFromItem(item), [item]);
  const currentPosterUrl = posterImages[currentPosterIndex] || '';
  const isProcessing = useMemo(() => isWorkProcessingStatus(item?.status), [item?.status]);
  const detailPreviewText = isCopy ? getCopyText(item) : String(item?.preview || '').trim();
  const selectableImageUrl = useMemo(() => {
    if (!selectTarget || isProcessing) return '';
    if (isImageText && currentPosterUrl) return currentPosterUrl;
    return resolveSingleImageUrl();
  }, [currentPosterUrl, isImageText, isProcessing, posterImages, selectTarget, coverUrl]);

  useEffect(() => {
    if (posterImages.length === 0) {
      setCurrentPosterIndex(0);
      return;
    }
    if (currentPosterIndex > posterImages.length - 1) {
      setCurrentPosterIndex(0);
    }
  }, [currentPosterIndex, posterImages.length]);

  const statusText = useMemo(() => {
    const status = String(item?.status ?? '').toUpperCase();
    if (status.includes('COMPLETE') || status === 'DONE' || status === 'SUCCESS') return '已完成';
    if (isCopyWork(item) && isWorkProcessingStatus(status)) return '撰写中';
    if (status.includes('GENERAT') || status.includes('PROCESS')) return '生成中';
    if (status.includes('FAIL') || status.includes('ERROR')) return '失败';
    if (status === 'CREATED' || status === 'CREATE' || status === 'INIT' || status === 'INITIALIZED') return isCopyWork(item) ? '撰写中' : '待处理';
    if (status.includes('PEND') || status.includes('QUEUE') || status.includes('WAIT')) return isCopyWork(item) ? '撰写中' : '待处理';
    return item?.status || '--';
  }, [item]);
  const canDownload = Boolean(item) && !isProcessing;

  const publishQrcode = useMemo(() => {
    const meta = item?.metadata;
    if (!meta || typeof meta !== 'object') return '';
    const publish = (meta as Record<string, unknown>).xhsPublish;
    if (!publish || typeof publish !== 'object') return '';
    const qrcode = (publish as Record<string, unknown>).qrcode;
    return typeof qrcode === 'string' ? qrcode.trim() : '';
  }, [item]);

  const handleBack = () => {
    Taro.navigateBack({ delta: 1 });
  };

  const handlePreviewImage = (index: number) => {
    if (posterImages.length === 0) return;
    Taro.previewImage({
      urls: posterImages,
      current: posterImages[Math.max(0, Math.min(index, posterImages.length - 1))],
    });
  };

  const rememberPosterRatio = (url: string, width?: number, height?: number) => {
    if (!url || !width || !height || width <= 0 || height <= 0) return;
    const ratio = height / width;
    setPosterRatioMap((prev) => {
      if (Math.abs((prev[url] || 0) - ratio) < 0.001) return prev;
      return { ...prev, [url]: ratio };
    });
  };

  const getPosterDisplayHeight = (url: string) => {
    const ratio = posterRatioMap[url];
    if (!ratio || ratio <= 0) return DETAIL_IMAGE_FALLBACK_HEIGHT_RPX;
    return Math.round(DETAIL_IMAGE_WIDTH_RPX * ratio);
  };

  const ensureAlbumPermission = async () => {
    try {
      const setting = await Taro.getSetting();
      const writePermission = setting.authSetting?.['scope.writePhotosAlbum'];
      if (writePermission === true) return true;

      if (writePermission === false) {
        const modal = await Taro.showModal({
          title: '需要相册权限',
          content: '下载前需要允许保存到相册，请在设置中开启权限',
          confirmText: '去设置',
        });
        if (!modal.confirm) return false;
        await Taro.openSetting();
        const next = await Taro.getSetting();
        return Boolean(next.authSetting?.['scope.writePhotosAlbum']);
      }

      await Taro.authorize({ scope: 'scope.writePhotosAlbum' });
      return true;
    } catch {
      const modal = await Taro.showModal({
        title: '需要相册权限',
        content: '下载前需要允许保存到相册，请在设置中开启权限',
        confirmText: '去设置',
      });
      if (!modal.confirm) return false;
      try {
        await Taro.openSetting();
        const next = await Taro.getSetting();
        return Boolean(next.authSetting?.['scope.writePhotosAlbum']);
      } catch {
        return false;
      }
    }
  };

  const saveMediaFromUrl = async (url: string, mediaType: 'image' | 'video') => {
    const apiKey = getApiKey();
    const downloadRes = await Taro.downloadFile({
      url: buildDownloadUrl(url, mediaType),
      header: apiKey ? { 'x-user-api-key': apiKey } : undefined,
    });
    if (!downloadRes.tempFilePath || (typeof downloadRes.statusCode === 'number' && downloadRes.statusCode >= 400)) {
      throw new Error('下载失败');
    }
    if (mediaType === 'video') {
      await Taro.saveVideoToPhotosAlbum({ filePath: downloadRes.tempFilePath });
      return;
    }
    await Taro.saveImageToPhotosAlbum({ filePath: downloadRes.tempFilePath });
  };

  function resolveSingleImageUrl() {
    if (posterImages.length > 0) return posterImages[0];
    if (coverUrl && /\.(jpg|jpeg|png|webp)(\?|$)/i.test(coverUrl)) return coverUrl;
    return '';
  }

  const handleUseForActionTransfer = () => {
    if (!selectTarget || !selectableImageUrl) {
      Taro.showToast({ title: '未找到可使用图片', icon: 'none' });
      return;
    }
    Taro.setStorageSync(selectTarget.storageKey || ACTION_TRANSFER_IMAGE_RETURN_KEY, selectableImageUrl);
    Taro.removeStorageSync(WORK_SELECT_TARGET_STORAGE_KEY);
    Taro.showToast({ title: '已选择图片', icon: 'success' });
    setTimeout(() => {
      Taro.navigateTo({ url: selectTarget.backUrl || '/subpages/remix-generate/index?mode=action-transfer' });
    }, 260);
  };

  const handleDelete = async () => {
    if (!item || deleting) return;
    const modal = await Taro.showModal({
      title: '删除作品',
      content: '删除后不可恢复，确认删除吗？',
      confirmText: '删除',
      confirmColor: '#ff5a5f',
    });
    if (!modal.confirm) return;

    setDeleting(true);
    try {
      await miniappApi.deleteWorkItem(item);
      Taro.showToast({ title: '已删除', icon: 'success' });
      setTimeout(() => {
        Taro.navigateBack({ delta: 1 });
      }, 360);
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '删除失败',
        icon: 'none',
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleDownloadMain = async () => {
    if (!canDownload) {
      Taro.showToast({ title: isCopy ? '文案撰写中，暂不可下载' : '生成中的任务暂不可下载', icon: 'none' });
      return;
    }
    if (!item || downloading) return;

    if (isCopy) {
      const copyText = getCopyText(item);
      if (!copyText) {
        Taro.showToast({ title: '暂无可复制文案', icon: 'none' });
        return;
      }
      await Taro.setClipboardData({ data: copyText });
      Taro.showToast({ title: '文案已复制', icon: 'success' });
      return;
    }

    const granted = await ensureAlbumPermission();
    if (!granted) {
      Taro.showToast({ title: '未开启相册权限', icon: 'none' });
      return;
    }

    setDownloading(true);
    try {
      if (posterImages.length > 1) {
        let success = 0;
        for (const url of posterImages) {
          try {
            await saveMediaFromUrl(url, 'image');
            success += 1;
          } catch {
            // 忽略单张失败，继续下载后续图片
          }
        }
        if (success === 0) throw new Error('下载失败');
        Taro.showToast({ title: `已保存 ${success}/${posterImages.length} 张`, icon: 'none' });
        return;
      }

      if (item.type === 'video') {
        if (!videoUrl) throw new Error('未找到可下载视频');
        await saveMediaFromUrl(videoUrl, 'video');
        Taro.showToast({ title: '视频已保存', icon: 'success' });
        return;
      }

      const imageUrl = resolveSingleImageUrl();
      if (!imageUrl) throw new Error('未找到可下载图片');
      await saveMediaFromUrl(imageUrl, 'image');
      Taro.showToast({ title: '已保存到相册', icon: 'success' });
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '下载失败',
        icon: 'none',
      });
    } finally {
      setDownloading(false);
    }
  };

  const ensureCopyReady = () => {
    if (isProcessing) {
      Taro.showToast({ title: '文案撰写中，请完成后再使用', icon: 'none' });
      return '';
    }
    const copyText = getCopyText(item);
    if (!copyText) {
      Taro.showToast({ title: '正文为空，请稍后刷新', icon: 'none' });
      return '';
    }
    return copyText;
  };

  const handleGenerateCardFromCopy = (targetFeature: 'card-layout' | 'infographic') => {
    const copyText = ensureCopyReady();
    if (!copyText || !item) return;
    Taro.setStorageSync(SMART_COPY_CARD_PAYLOAD_KEY, {
      targetFeature,
      title: String(item.title || '智能文案'),
      body: copyText,
    });
    Taro.navigateTo({
      url: `/subpages/image-generate/index?from=smart-copy&targetFeature=${targetFeature}`,
    });
  };

  const handleGenerateDigitalHumanFromCopy = () => {
    const copyText = ensureCopyReady();
    if (!copyText || !item) return;
    Taro.setStorageSync(SMART_COPY_SCRIPT_PAYLOAD_KEY, {
      title: String(item.title || '智能文案'),
      script: copyText,
    });
    Taro.navigateTo({ url: '/subpages/generate/index?from=smart-copy&feature=digital-human' });
  };

  const downloadBtnText = isCopy ? '复制文案' : isImageText ? '下载全部' : '下载';

  return (
    <View className='work-detail-page'>
      <View className='work-detail-nav'>
        <View className='work-detail-back' onClick={handleBack}>
          <Text className='work-detail-back-text'>‹</Text>
        </View>
        <Text className='work-detail-nav-title'>作品详情</Text>
        <View className='work-detail-nav-spacer' />
      </View>

      {!item ? (
        <View className='work-detail-empty'>
          <Text className='work-detail-empty-text'>未找到作品，请返回重试</Text>
        </View>
      ) : (
        <View className='work-detail-content'>
          <ScrollView scrollY className='work-detail-scroll'>
            <View className={`work-detail-panel ${item.type === 'video' ? 'work-detail-panel--video' : ''}`}>
              <View className='work-detail-cover-wrap'>
                {isImageText && posterImages.length > 0 ? (
                  <View className='work-detail-swiper-wrap' style={{ height: `${getPosterDisplayHeight(currentPosterUrl)}rpx` }}>
                    <Swiper
                      className='work-detail-swiper'
                      style={{ height: `${getPosterDisplayHeight(currentPosterUrl)}rpx` }}
                      indicatorDots={false}
                      circular={false}
                      current={currentPosterIndex}
                      onChange={(event) => setCurrentPosterIndex(event.detail.current)}
                    >
                      {posterImages.map((url, index) => (
                        <SwiperItem key={`${url}-${index}`} className='work-detail-swiper-item'>
                          <Image
                            className='work-detail-cover work-detail-swiper-image'
                            src={url}
                            mode='widthFix'
                            onLoad={(event) => rememberPosterRatio(url, event.detail.width, event.detail.height)}
                            onClick={() => handlePreviewImage(index)}
                          />
                        </SwiperItem>
                      ))}
                    </Swiper>
                    <View className='work-detail-swiper-indicator'>
                      <Text className='work-detail-swiper-indicator-text'>{currentPosterIndex + 1}/{posterImages.length}</Text>
                    </View>
                  </View>
                ) : coverUrl ? (
                  item.type === 'video' && videoUrl ? (
                    <Video
                      className='work-detail-video'
                      src={videoUrl}
                      poster={coverUrl}
                      controls
                      autoplay={false}
                      muted
                      showMuteBtn
                      showCenterPlayBtn
                      showFullscreenBtn
                      enablePlayGesture
                      objectFit='contain'
                      playBtnPosition='center'
                    />
                  ) : (
                    <Image className='work-detail-cover' src={coverUrl} mode='widthFix' />
                  )
                ) : item.type === 'video' && videoUrl ? (
                  <Video
                    className='work-detail-video'
                    src={videoUrl}
                    controls
                    autoplay={false}
                    muted
                    showMuteBtn
                    showCenterPlayBtn
                    showFullscreenBtn
                    enablePlayGesture
                    objectFit='contain'
                    playBtnPosition='center'
                  />
                ) : (
                  <View className='work-detail-cover-placeholder'>
                    {renderWorkDetailPlaceholderIcon(getPlaceholderKind(item.type))}
                  </View>
                )}
                {item.type === 'video' && !videoUrl && (
                  <View className='work-detail-video-icon'>
                    <Text className='work-detail-video-icon-text'>▶</Text>
                  </View>
                )}
              </View>

              <View className='work-detail-body'>
                <Text className='work-detail-title'>{item.title || '未命名作品'}</Text>
                <View className='work-detail-meta'>
                  <Text className='work-detail-type'>{getTypeLabel(item.type)}</Text>
                  <Text className='work-detail-status'>{statusText}</Text>
                </View>
                {!!detailPreviewText && (
                  <View className='work-detail-preview-card'>
                    <Text className='work-detail-preview-label'>
                      {isCopy ? '正文' : item.taskType === 'digitalHuman' ? '口播文案' : '内容'}
                    </Text>
                    <Text className='work-detail-preview'>{detailPreviewText}</Text>
                  </View>
                )}
                {publishQrcode && (
                  <View className='work-detail-qrcode-card'>
                    <Text className='work-detail-qrcode-title'>小红书发布二维码</Text>
                    <Image className='work-detail-qrcode-image' src={buildQrcodeImageSrc(publishQrcode)} mode='aspectFit' />
                  </View>
                )}
                <Text className='work-detail-date'>{formatDate(item.createdAt)}</Text>
              </View>
            </View>
          </ScrollView>

          {isCopy ? (
            <View className='work-detail-action-bar work-detail-action-bar--copy'>
              <View
                className={`work-detail-action-btn work-detail-copy-action-btn ${isProcessing ? 'work-detail-action-btn--disabled' : ''}`}
                onClick={() => handleGenerateCardFromCopy('card-layout')}
              >
                <Text className='work-detail-copy-action-btn-text'>生成图文卡片</Text>
              </View>
              <View
                className={`work-detail-action-btn work-detail-copy-action-btn ${isProcessing ? 'work-detail-action-btn--disabled' : ''}`}
                onClick={() => handleGenerateCardFromCopy('infographic')}
              >
                <Text className='work-detail-copy-action-btn-text'>信息卡片</Text>
              </View>
              <View
                className={`work-detail-action-btn work-detail-copy-action-btn ${isProcessing ? 'work-detail-action-btn--disabled' : ''}`}
                onClick={handleGenerateDigitalHumanFromCopy}
              >
                <Text className='work-detail-copy-action-btn-text'>数字人</Text>
              </View>
              <View
                className={`work-detail-action-btn work-detail-delete-btn work-detail-delete-btn--copy ${deleting ? 'work-detail-action-btn--disabled' : ''}`}
                onClick={() => {
                  void handleDelete();
                }}
              >
                <Text className='work-detail-delete-btn-text'>{deleting ? '删除中...' : '删除'}</Text>
              </View>
            </View>
          ) : (
            <View className='work-detail-action-bar'>
              <View
                className={`work-detail-action-btn work-detail-delete-btn ${deleting ? 'work-detail-action-btn--disabled' : ''}`}
                onClick={() => {
                  void handleDelete();
                }}
              >
                <Text className='work-detail-delete-btn-text'>{deleting ? '删除中...' : '删除'}</Text>
              </View>
              {selectTarget && (
                <View
                  className={`work-detail-action-btn work-detail-use-btn ${!selectableImageUrl ? 'work-detail-action-btn--disabled' : ''}`}
                  onClick={handleUseForActionTransfer}
                >
                  <Text className='work-detail-use-btn-text'>用于动作复刻</Text>
                </View>
              )}
              <View
                className={`work-detail-action-btn work-detail-download-btn ${downloading || !canDownload ? 'work-detail-action-btn--disabled' : ''}`}
                onClick={() => {
                  void handleDownloadMain();
                }}
              >
                <Text className='work-detail-download-btn-text'>{isProcessing ? '生成中不可下载' : downloading ? '下载中...' : downloadBtnText}</Text>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function getApiBaseUrl(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fromDefine = typeof __API_BASE_URL__ !== 'undefined' ? String((__API_BASE_URL__ as any) || '').trim() : '';
    if (fromDefine) return fromDefine.replace(/\/$/, '');
  } catch {
    // ignore
  }
  return '';
}

function getApiKey(): string {
  try {
    return String(Taro.getStorageSync('API_KEY') || '').trim();
  } catch {
    return '';
  }
}

function buildDownloadUrl(url: string, mediaType: 'image' | 'video'): string {
  const filename = mediaType === 'video' ? `video-${Date.now()}.mp4` : `image-${Date.now()}.jpg`;
  const path = `/api/proxy/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}

function resolveVideoUrlFromItem(item: any): string {
  if (!item) return '';

  const metadata = item?.metadata && typeof item.metadata === 'object'
    ? item.metadata as Record<string, unknown>
    : null;
  const urls: string[] = [];

  const pushUrls = (value: unknown, depth = 0) => {
    if (depth > 4 || value == null) return;

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return;
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          pushUrls(JSON.parse(trimmed), depth + 1);
          return;
        } catch {
          // Keep treating it as a plain string below.
        }
      }
      urls.push(trimmed);
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((entry) => pushUrls(entry, depth + 1));
      return;
    }

    if (typeof value === 'object') {
      Object.values(value as Record<string, unknown>).forEach((entry) => pushUrls(entry, depth + 1));
    }
  };

  [
    item.preview,
    item.videoUrl,
    item.resultUrl,
    item.outputUrl,
    metadata?.videoUrl,
    metadata?.video_url,
    metadata?.resultUrl,
    metadata?.result_url,
    metadata?.outputUrl,
    metadata?.output_url,
    metadata?.finalVideoUrl,
    metadata?.final_video_url,
    metadata?.mediaUrls,
    metadata?.media_urls,
    metadata?.outputs,
    metadata?.result,
    metadata?.raw,
  ].forEach((candidate) => pushUrls(candidate));

  const exact = urls.find((url) => VIDEO_URL_RE.test(url));
  if (exact) return exact;
  return urls.find((url) => HTTP_URL_RE.test(url)) || '';
}

function normalizeStoredWorkDetailItem(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function collectImageUrls(value: unknown, depth = 0): string[] {
  if (depth > 5 || value == null) return [];

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return collectImageUrls(JSON.parse(trimmed), depth + 1);
      } catch {
        return isImageUrl(trimmed) ? [trimmed] : [];
      }
    }
    return isImageUrl(trimmed) ? [trimmed] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectImageUrls(entry, depth + 1));
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const preferred = [
      obj.url,
      obj.imageUrl,
      obj.image_url,
      obj.src,
      obj.publicUrl,
      obj.public_url,
      obj.fileUrl,
      obj.file_url,
      obj.thumbnailUrl,
      obj.thumbnail_url,
      obj.coverUrl,
      obj.cover_url,
    ].flatMap((entry) => collectImageUrls(entry, depth + 1));
    if (preferred.length > 0) return preferred;
    return Object.values(obj).flatMap((entry) => collectImageUrls(entry, depth + 1));
  }

  return [];
}

function getPosterImages(item: any): string[] {
  const metadata = item?.metadata && typeof item.metadata === 'object'
    ? item.metadata as Record<string, unknown>
    : null;
  const custom = metadata?.custom && typeof metadata.custom === 'object'
    ? metadata.custom as Record<string, unknown>
    : null;
  const layout = metadata?.xhsLayout && typeof metadata.xhsLayout === 'object'
    ? metadata.xhsLayout as Record<string, unknown>
    : null;
  const canvasImage = metadata?.canvasImage && typeof metadata.canvasImage === 'object'
    ? metadata.canvasImage as Record<string, unknown>
    : null;

  const candidates = [
    layout?.images,
    canvasImage?.images,
    canvasImage?.generatedImages,
    canvasImage?.generated_images,
    metadata?.images,
    metadata?.imageUrls,
    metadata?.image_urls,
    metadata?.generatedImages,
    metadata?.generated_images,
    metadata?.generatedImagesJson,
    metadata?.generated_images_json,
    custom?.xhsLayout,
    custom?.images,
    custom?.imageUrls,
    custom?.image_urls,
    custom?.generatedImages,
    custom?.generated_images,
    item?.images,
    item?.imageUrls,
    item?.image_urls,
    item?.generatedImages,
    item?.generated_images,
    item?.generatedImagesJson,
    item?.generated_images_json,
  ];

  const urls = candidates.flatMap((candidate) => collectImageUrls(candidate));
  return Array.from(new Set(urls));
}

function isImageUrl(value: string) {
  if (!/^https?:\/\//i.test(value)) return false;
  return !VIDEO_URL_RE.test(value);
}

function getTypeLabel(type: string) {
  if (type === 'video') return '视频';
  if (type === 'image-text') return '图文';
  if (type === 'copy') return '文案';
  return '任务';
}

function isWorkProcessingStatus(value: unknown) {
  const status = String(value || '').toUpperCase();
  return (
    status.includes('GENERAT') ||
    status.includes('PROCESS') ||
    status.includes('PEND') ||
    status.includes('QUEUE') ||
    status.includes('WAIT') ||
    status.includes('RUNNING') ||
    status.includes('START') ||
    status === 'ACTIVE' ||
    status === 'CREATED' ||
    status === 'CREATE' ||
    status === 'INIT' ||
    status === 'INITIALIZED'
  );
}

function isCopyWork(item: any): boolean {
  const taskType = String(item?.taskType || '').toLowerCase();
  return item?.type === 'copy' || taskType === 'creative' || taskType.includes('copy') || taskType.includes('writing');
}

function getCopyText(item: any): string {
  const metadata = item?.metadata && typeof item.metadata === 'object'
    ? item.metadata as Record<string, unknown>
    : null;
  const candidates = [
    item?.generatedText,
    item?.copyText,
    item?.content,
    item?.preview,
    metadata?.generatedText,
    metadata?.generated_text,
    metadata?.copyText,
    metadata?.copy_text,
    metadata?.content,
    metadata?.scriptContent,
    metadata?.script_content,
  ];
  for (const candidate of candidates) {
    const text = typeof candidate === 'string' ? candidate.trim() : '';
    if (text) return text;
  }
  return '';
}

type PlaceholderKind = 'video' | 'image' | 'copy';

function getPlaceholderKind(type?: string): PlaceholderKind {
  if (type === 'video') return 'video';
  if (type === 'image-text') return 'image';
  return 'copy';
}

function renderWorkDetailPlaceholderIcon(kind: PlaceholderKind) {
  if (kind === 'video') {
    return (
      <View className='work-detail-placeholder-icon'>
        <View className='work-detail-placeholder-video-triangle' />
      </View>
    );
  }

  if (kind === 'image') {
    return (
      <View className='work-detail-placeholder-icon'>
        <View className='work-detail-placeholder-image-dot' />
        <View className='work-detail-placeholder-image-mountain' />
      </View>
    );
  }

  return (
    <View className='work-detail-placeholder-icon'>
      <View className='work-detail-placeholder-doc' />
      <View className='work-detail-placeholder-doc-line work-detail-placeholder-doc-line--top' />
      <View className='work-detail-placeholder-doc-line work-detail-placeholder-doc-line--mid' />
      <View className='work-detail-placeholder-doc-line work-detail-placeholder-doc-line--bottom' />
      <View className='work-detail-placeholder-pen' />
    </View>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';

  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${month}/${day} ${hour}:${minute}`;
}
