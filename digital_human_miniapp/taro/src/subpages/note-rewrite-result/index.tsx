import { View, Text, Image, ScrollView, Swiper, SwiperItem } from '@tarojs/components';
import Taro, { useDidShow, useLoad, useUnload } from '@tarojs/taro';
import { useMemo, useRef, useState } from 'react';
import { miniappApi, type MyNoteTaskDetail } from '../../utils/miniapp-api';
import './index.sass';

const RESULT_STORAGE_KEY = 'NOTE_REWRITE_RESULT_ASSETS_V1';
const RETURN_PAYLOAD_KEY = 'HOT_REWRITE_RETURN_PAYLOAD';
const HOT_REWRITE_STATE_KEY = 'HOT_REWRITE_RESULT_STATE_V1';
const IMAGE_WIDTH_RPX = 750;
const IMAGE_FALLBACK_HEIGHT_RPX = 1000;
const POLL_MS = 2800;

type ResultKind = 'infographic' | 'card-layout';
type GeneratedStatus = 'idle' | 'generating' | 'generated';

type ResultBucket = {
  infographic?: {
    taskId?: string;
    images?: string[];
    qrcode?: string;
    url?: string;
  };
  cardLayout?: {
    taskId?: string;
    images?: string[];
    qrcode?: string;
    url?: string;
  };
};

type RewriteImageViewMode = 'original' | 'rewrite';

type HotRewriteState = {
  infographic?: {
    status?: GeneratedStatus;
    taskId?: string;
    generatedTaskId?: string;
    title?: string;
    images?: string[];
    qrcode?: string;
    url?: string;
    updatedAt?: number;
  };
  cardLayout?: {
    status?: GeneratedStatus;
    taskId?: string;
    generatedTaskId?: string;
    title?: string;
    images?: string[];
    qrcode?: string;
    url?: string;
    updatedAt?: number;
  };
};

type ReturnPayload = {
  taskId?: string;
  mode?: string;
  kind?: ResultKind;
  status?: GeneratedStatus;
  generatedTaskId?: string;
  images?: string[];
  qrcode?: string;
  url?: string;
};

function readAssetStore(): Record<string, ResultBucket> {
  try {
    const raw = Taro.getStorageSync(RESULT_STORAGE_KEY);
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, ResultBucket> : {};
  } catch {
    return {};
  }
}

function writeAssetStore(store: Record<string, ResultBucket>) {
  try {
    Taro.setStorageSync(RESULT_STORAGE_KEY, store);
  } catch {
    // ignore storage failures
  }
}

function readHotRewriteState(): Record<string, HotRewriteState> {
  try {
    const raw = Taro.getStorageSync(HOT_REWRITE_STATE_KEY);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return raw as Record<string, HotRewriteState>;
  } catch {
    return {};
  }
}

function writeHotRewriteState(store: Record<string, HotRewriteState>) {
  try {
    Taro.setStorageSync(HOT_REWRITE_STATE_KEY, store);
  } catch {
    // ignore storage failures
  }
}

function normalizeImages(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
}

function normalizeTag(tag: string) {
  return tag.replace(/^#+/, '').trim();
}

function extractTags(rewrite: MyNoteTaskDetail['analysisResult']['rewriteResult'] | null): string[] {
  const fromField = Array.isArray(rewrite?.tags) ? rewrite.tags : [];
  const fromBody = `${rewrite?.body || ''}\n${(rewrite?.imageTexts || []).join('\n')}`
    .match(/#[\p{L}\p{N}_\u4e00-\u9fa5-]+/gu) || [];
  return Array.from(new Set([...fromField, ...fromBody].map((tag) => normalizeTag(tag)).filter(Boolean))).slice(0, 8);
}

function copyText(label: string, value: string) {
  const text = String(value || '').trim();
  if (!text) {
    Taro.showToast({ title: `${label}为空`, icon: 'none' });
    return;
  }
  Taro.setClipboardData({
    data: text,
    success: () => Taro.showToast({ title: `${label}已复制`, icon: 'success' }),
    fail: () => Taro.showToast({ title: '复制失败', icon: 'none' }),
  });
}

export default function NoteRewriteResultPage() {
  const [taskId, setTaskId] = useState('');
  const [mode, setMode] = useState('');
  const [task, setTask] = useState<MyNoteTaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [assets, setAssets] = useState<ResultBucket>({});
  const [activeResult, setActiveResult] = useState<ResultKind>('card-layout');
  const [rewriteImageViewMode, setRewriteImageViewMode] = useState<RewriteImageViewMode>('rewrite');
  const [currentSlide, setCurrentSlide] = useState(0);
  const [ratioMap, setRatioMap] = useState<Record<string, number>>({});
  const pollTimerRef = useRef<number | null>(null);
  const taskIdRef = useRef('');
  const [resultState, setResultState] = useState<HotRewriteState>({});

  const clearPoll = () => {
    if (pollTimerRef.current != null) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const mergeAssets = (next: ResultBucket, targetTaskId = taskIdRef.current) => {
    if (!targetTaskId) return;
    setAssets((prev) => {
      const merged = {
        ...prev,
        infographic: { ...(prev.infographic || {}), ...(next.infographic || {}) },
        cardLayout: { ...(prev.cardLayout || {}), ...(next.cardLayout || {}) },
      };
      const store = readAssetStore();
      store[targetTaskId] = merged;
      writeAssetStore(store);
      return merged;
    });
  };

  const mergeResultState = (next: HotRewriteState, targetTaskId = taskIdRef.current) => {
    if (!targetTaskId) return;
    setResultState((prev) => {
      const merged = {
        ...prev,
        infographic: { ...(prev.infographic || {}), ...(next.infographic || {}) },
        cardLayout: { ...(prev.cardLayout || {}), ...(next.cardLayout || {}) },
      };
      const store = readHotRewriteState();
      store[targetTaskId] = merged;
      writeHotRewriteState(store);
      return merged;
    });
  };

  const loadTask = async (id: string, silent = false) => {
    if (!id) return null;
    if (!silent) setLoading(true);
    try {
      const detail = await miniappApi.getImageTextMyNoteTask(id);
      setTask(detail);
      return detail;
    } catch (error) {
      if (!silent) Taro.showToast({ title: error instanceof Error ? error.message : '加载失败', icon: 'none' });
      return null;
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const pollGeneratedTask = (generatedTaskId: string) => {
    if (!generatedTaskId) return;
    clearPoll();
    pollTimerRef.current = setInterval(() => {
      void (async () => {
        try {
          const detail = await miniappApi.getCreativeTask(generatedTaskId);
          const images = normalizeImages(detail.generatedImages);
          if (images.length > 0) {
            mergeAssets({ infographic: { taskId: generatedTaskId, images } });
            mergeResultState({
              infographic: {
                status: 'generated',
                generatedTaskId,
                images,
                updatedAt: Date.now(),
              },
            });
            clearPoll();
          }
          const status = String(detail.status || '').toUpperCase();
          if (status.includes('FAILED') || status.includes('ERROR') || status.includes('COMPLETED')) clearPoll();
        } catch {
          // keep polling while the task is still settling
        }
      })();
    }, POLL_MS) as unknown as number;
  };

  const applyReturnPayload = (payload: ReturnPayload | null, targetTaskId = taskIdRef.current) => {
    if (!payload || !targetTaskId || String(payload.taskId || '') !== targetTaskId) return;
    const kind = payload.kind === 'infographic' ? 'infographic' : 'card-layout';
    const generatedTaskId = String(payload.generatedTaskId || '').trim();
    const images = normalizeImages(payload.images);
    const qrcode = String(payload.qrcode || '').trim();
    const url = String(payload.url || '').trim();
    const status = payload.status === 'generated' ? 'generated' : 'generating';
    if (kind === 'infographic') {
      mergeAssets({ infographic: { taskId: generatedTaskId, images, qrcode, url } }, targetTaskId);
      mergeResultState({
        infographic: {
          status,
          taskId,
          generatedTaskId,
          images,
          qrcode,
          url,
          updatedAt: Date.now(),
        },
      }, targetTaskId);
      setActiveResult('infographic');
      if (status !== 'generated' && generatedTaskId) pollGeneratedTask(generatedTaskId);
    } else {
      mergeAssets({ cardLayout: { taskId: generatedTaskId, images, qrcode, url } }, targetTaskId);
      mergeResultState({
        cardLayout: {
          status: images.length > 0 ? 'generated' : 'generating',
          taskId,
          generatedTaskId,
          images,
          qrcode,
          url,
          updatedAt: Date.now(),
        },
      }, targetTaskId);
      setActiveResult('card-layout');
    }
  };

  useLoad((query) => {
    const id = String(query?.taskId || query?.myTaskId || '').trim();
    const nextMode = String(query?.mode || '').trim();
    taskIdRef.current = id;
    setTaskId(id);
    setMode(nextMode);
    const stored = readAssetStore()[id] || {};
    setAssets(stored);
    const storedState = readHotRewriteState()[id] || {};
    setResultState(storedState);
    if (storedState.cardLayout?.status || stored.cardLayout?.images?.length) {
      setActiveResult('card-layout');
    } else if (storedState.infographic?.status || stored.infographic?.images?.length) {
      setActiveResult('infographic');
    }
    const returned = Taro.getStorageSync(RETURN_PAYLOAD_KEY);
    if (returned && typeof returned === 'object') {
      applyReturnPayload(returned as ReturnPayload, id);
      Taro.removeStorageSync(RETURN_PAYLOAD_KEY);
    }
    void loadTask(id);
  });

  useDidShow(() => {
    const id = taskIdRef.current || taskId;
    if (id) {
      void loadTask(id, true);
      const stored = readAssetStore()[id] || {};
      const storedState = readHotRewriteState()[id] || {};
      setAssets(stored);
      setResultState(storedState);
      if (storedState.cardLayout?.status || stored.cardLayout?.images?.length) {
        setActiveResult('card-layout');
      } else if (storedState.infographic?.status || stored.infographic?.images?.length) {
        setActiveResult('infographic');
      }
    }
    const returned = Taro.getStorageSync(RETURN_PAYLOAD_KEY);
    if (returned && typeof returned === 'object') {
      applyReturnPayload(returned as ReturnPayload, id);
      Taro.removeStorageSync(RETURN_PAYLOAD_KEY);
    }
  });

  useUnload(() => clearPoll());

  const rewrite = task?.analysisResult?.rewriteResult || null;
  const title = rewrite?.title || task?.source.title || '仿写结果';
  const originalImageTextItems = useMemo(() => {
    const sourceTexts = Array.isArray(task?.analysisResult?.extractedImageTexts)
      ? task.analysisResult.extractedImageTexts
      : [];
    return sourceTexts
      .map((item) => String(item?.text || '').trim())
      .filter(Boolean);
  }, [task?.analysisResult?.extractedImageTexts]);
  const rewriteImageTextItems = useMemo(() => {
    return Array.isArray(rewrite?.imageTexts)
      ? rewrite.imageTexts.map((text) => String(text || '').trim()).filter(Boolean)
      : [];
  }, [rewrite?.imageTexts]);
  const images = useMemo(() => {
    if (!task) return [] as string[];
    const source = task.analysisResult.sourceImages.length > 0 ? task.analysisResult.sourceImages : task.source.images;
    return source.filter(Boolean);
  }, [task]);
  const tags = useMemo(() => extractTags(rewrite), [rewrite]);
  const activeBucket = activeResult === 'infographic' ? assets.infographic : assets.cardLayout;
  const activeImages = normalizeImages(activeBucket?.images);
  const activePublish = activeBucket;
  const activeImageTextItems = rewriteImageViewMode === 'original' ? originalImageTextItems : rewriteImageTextItems;
  const activeImageTextLabel = rewriteImageViewMode === 'original'
    ? `原文案 (${originalImageTextItems.length})`
    : `仿写文案 (${rewriteImageTextItems.length})`;
  const activeImageTextCopy = activeImageTextItems.join('\n\n');

  const rememberRatio = (url: string, width?: number, height?: number) => {
    if (!url || !width || !height || width <= 0 || height <= 0) return;
    const ratio = height / width;
    setRatioMap((prev) => Math.abs((prev[url] || 0) - ratio) < 0.001 ? prev : { ...prev, [url]: ratio });
  };

  const getImageHeight = (url: string) => {
    const ratio = ratioMap[url];
    if (!ratio || ratio <= 0) return IMAGE_FALLBACK_HEIGHT_RPX;
    return Math.round(IMAGE_WIDTH_RPX * ratio);
  };

  const openGenerator = (targetFeature: ResultKind, options?: { viewGenerated?: boolean }) => {
    if (!rewrite || !taskId) return;
    Taro.setStorageSync('MY_NOTE_REWRITE_PAYLOAD', {
      targetFeature,
      title,
      body: rewrite.body,
      imageTexts: rewrite.imageTexts,
    });
    const viewParam = options?.viewGenerated ? '&viewGenerated=1' : '';
    Taro.navigateTo({
      url: `/subpages/image-generate/index?origin=hot-rewrite&taskId=${encodeURIComponent(taskId)}&mode=${encodeURIComponent(mode)}&returnPage=note-rewrite-result&targetFeature=${encodeURIComponent(targetFeature)}${viewParam}`,
    });
  };

  const getFeatureStatusText = (targetFeature: ResultKind) => {
    const bucket = targetFeature === 'infographic' ? resultState.infographic : resultState.cardLayout;
    if (!bucket || bucket.status === 'idle') return targetFeature === 'infographic' ? '开始创作' : '一键生成';
    if (bucket.status === 'generating') return targetFeature === 'infographic' ? '正在创作' : '生成中';
    if (bucket.status === 'generated') return '已生成';
    return targetFeature === 'infographic' ? '开始创作' : '一键生成';
  };

  const shouldOpenExisting = (targetFeature: ResultKind) => {
    const bucket = targetFeature === 'infographic' ? resultState.infographic : resultState.cardLayout;
    return Boolean(bucket && bucket.status === 'generated' && normalizeImages(targetFeature === 'infographic' ? assets.infographic?.images : assets.cardLayout?.images).length > 0);
  };

  const getFeatureHint = (targetFeature: ResultKind) => {
    const bucket = targetFeature === 'infographic' ? resultState.infographic : resultState.cardLayout;
    if (!bucket || bucket.status === 'idle') return '';
    if (bucket.status === 'generating') return targetFeature === 'infographic' ? '任务已提交，去作品页查看' : '任务已提交，可去生成页查看';
    if (bucket.status === 'generated') return '点击查看或重新生成';
    return '';
  };

  const getFeatureSecondaryAction = (targetFeature: ResultKind) => {
    const bucket = targetFeature === 'infographic' ? resultState.infographic : resultState.cardLayout;
    if (!bucket || bucket.status === 'idle') return '';
    if (bucket.status === 'generating') return targetFeature === 'infographic' ? '查看作品' : '查看生成页';
    if (bucket.status === 'generated') return '重新生成';
    return '';
  };

  const handleFeatureSecondaryAction = (targetFeature: ResultKind) => {
    const bucket = targetFeature === 'infographic' ? resultState.infographic : resultState.cardLayout;
    if (!bucket || bucket.status === 'idle') return;
    if (bucket.status === 'generating') {
      if (targetFeature === 'infographic') {
        Taro.switchTab({ url: '/pages/works/index' });
        return;
      }
      openGenerator(targetFeature);
      return;
    }
    openGenerator(targetFeature);
  };

  const handleFeaturePrimaryAction = (targetFeature: ResultKind) => {
    const bucket = targetFeature === 'infographic' ? resultState.infographic : resultState.cardLayout;
    if (!bucket || bucket.status === 'idle') {
      openGenerator(targetFeature);
      return;
    }
    if (bucket.status === 'generating') {
      if (targetFeature === 'infographic') {
        Taro.switchTab({ url: '/pages/works/index' });
        return;
      }
      openGenerator(targetFeature);
      return;
    }
    if (shouldOpenExisting(targetFeature)) {
      if (targetFeature === 'infographic') {
        Taro.switchTab({ url: '/pages/works/index' });
      } else {
        openGenerator(targetFeature, { viewGenerated: true });
      }
      return;
    }
    openGenerator(targetFeature);
  };

  const handlePublish = async () => {
    if (!rewrite || publishing) return;
    const publishImages = activeImages.length > 0 ? activeImages : images;
    if (publishImages.length === 0) {
      Taro.showToast({ title: '暂无可发布图片', icon: 'none' });
      return;
    }
    setPublishing(true);
    try {
      const content = [
        rewrite.body,
        tags.map((tag) => `#${tag}`).join(' '),
        rewrite.imageTexts.join('\n\n'),
      ].filter(Boolean).join('\n\n').slice(0, 1000);
      const result = await miniappApi.publishXhsLayout({
        title,
        content,
        images: publishImages,
        taskId: activePublish?.taskId || taskId,
      });
      const next = activeResult === 'infographic'
        ? { infographic: { ...(assets.infographic || {}), qrcode: result.qrcode, url: result.url } }
        : { cardLayout: { ...(assets.cardLayout || {}), qrcode: result.qrcode, url: result.url } };
      mergeAssets(next);
      Taro.showToast({ title: result.qrcode ? '二维码已生成' : '发布已提交', icon: 'success' });
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '发布失败', icon: 'none' });
    } finally {
      setPublishing(false);
    }
  };

  const renderTopImages = () => {
    if (images.length === 0) return <View className='note-result-image-empty' />;
    if (images.length === 1) {
      return (
        <Image
          className='note-result-cover'
          src={images[0]}
          mode='widthFix'
          onLoad={(event) => rememberRatio(images[0], event.detail.width, event.detail.height)}
        />
      );
    }
    const activeImage = images[Math.max(0, Math.min(currentSlide, images.length - 1))] || images[0];
    const height = `${getImageHeight(activeImage)}rpx`;
    return (
      <View className='note-result-swiper-wrap' style={{ height }}>
        <Swiper className='note-result-swiper' style={{ height }} current={currentSlide} onChange={(event) => setCurrentSlide(event.detail.current)}>
          {images.map((url, index) => (
            <SwiperItem key={`${url}-${index}`}>
              <Image className='note-result-cover' src={url} mode='widthFix' onLoad={(event) => rememberRatio(url, event.detail.width, event.detail.height)} />
            </SwiperItem>
          ))}
        </Swiper>
        <View className='note-result-indicator'><Text className='note-result-indicator-text'>{currentSlide + 1}/{images.length}</Text></View>
      </View>
    );
  };

  return (
    <View className='note-result-page'>
      <View className='note-result-nav'>
        <View className='note-result-back' onClick={() => Taro.navigateBack({ delta: 1 })}><Text className='note-result-back-text'>‹</Text></View>
        <Text className='note-result-nav-title'>仿写结果</Text>
        <View className='note-result-nav-spacer' />
      </View>

      {loading && !task ? (
        <View className='note-result-empty'><Text className='note-result-empty-text'>加载中...</Text></View>
      ) : !rewrite ? (
        <View className='note-result-empty'><Text className='note-result-empty-text'>暂无仿写结果</Text></View>
      ) : (
        <>
          <ScrollView scrollY className='note-result-scroll'>
            {renderTopImages()}
            <View className='note-result-body'>
              <View className='note-result-section-head'>
                <Text className='note-result-section-title'>标题</Text>
                <View className='note-result-copy' onClick={() => copyText('标题', title)}><Text className='note-result-copy-text'>复制</Text></View>
              </View>
              <Text className='note-result-title'>{title}</Text>

              <View className='note-result-section-head'>
                <Text className='note-result-section-title'>正文</Text>
                <View className='note-result-copy' onClick={() => copyText('正文', rewrite.body)}><Text className='note-result-copy-text'>复制</Text></View>
              </View>
              <Text className='note-result-desc'>{rewrite.body || '--'}</Text>

              <View className='note-result-tag-row'>
                {tags.map((tag) => <Text key={tag} className='note-result-tag'>#{tag}</Text>)}
              </View>

              <View className='note-result-section-head note-result-section-head--spaced'>
                <Text className='note-result-section-title'>图片正文</Text>
                <View className='note-result-copy' onClick={() => copyText(activeImageTextLabel, activeImageTextCopy)}><Text className='note-result-copy-text'>复制</Text></View>
              </View>
              <View className='note-result-image-toggle'>
                <View
                  className={`note-result-image-toggle-item ${rewriteImageViewMode === 'original' ? 'note-result-image-toggle-item--active' : ''}`}
                  onClick={() => setRewriteImageViewMode('original')}
                >
                  <Text className={`note-result-image-toggle-text ${rewriteImageViewMode === 'original' ? 'note-result-image-toggle-text--active' : ''}`}>原文案</Text>
                </View>
                <View
                  className={`note-result-image-toggle-item ${rewriteImageViewMode === 'rewrite' ? 'note-result-image-toggle-item--active' : ''}`}
                  onClick={() => setRewriteImageViewMode('rewrite')}
                >
                  <Text className={`note-result-image-toggle-text ${rewriteImageViewMode === 'rewrite' ? 'note-result-image-toggle-text--active' : ''}`}>仿写文案</Text>
                </View>
              </View>
              {activeImageTextItems.length > 0 ? activeImageTextItems.map((text, index) => (
                <Text key={`${rewriteImageViewMode}-${index}-${text}`} className='note-result-image-text'>{text}</Text>
              )) : (
                <Text className='note-result-image-text note-result-image-text--empty'>
                  {rewriteImageViewMode === 'original' ? '暂无原文案' : '暂无仿写文案'}
                </Text>
              )}
            </View>
          </ScrollView>

          <View className='note-result-action-bar'>
            <View className='note-result-action' onClick={() => handleFeaturePrimaryAction('infographic')}>
              <Text className='note-result-action-text'>{getFeatureStatusText('infographic')}</Text>
              {!!getFeatureHint('infographic') && <Text className='note-result-action-hint'>{getFeatureHint('infographic')}</Text>}
              {!!getFeatureSecondaryAction('infographic') && (
                <View className='note-result-action-link' onClick={(event) => { event.stopPropagation(); handleFeatureSecondaryAction('infographic'); }}>
                  <Text className='note-result-action-link-text'>{getFeatureSecondaryAction('infographic')}</Text>
                </View>
              )}
            </View>
            <View className='note-result-action' onClick={() => handleFeaturePrimaryAction('card-layout')}>
              <Text className='note-result-action-text'>{getFeatureStatusText('card-layout')}</Text>
              {!!getFeatureHint('card-layout') && <Text className='note-result-action-hint'>{getFeatureHint('card-layout')}</Text>}
              {!!getFeatureSecondaryAction('card-layout') && (
                <View className='note-result-action-link' onClick={(event) => { event.stopPropagation(); handleFeatureSecondaryAction('card-layout'); }}>
                  <Text className='note-result-action-link-text'>{getFeatureSecondaryAction('card-layout')}</Text>
                </View>
              )}
            </View>
            <View className={`note-result-action note-result-action--publish ${publishing ? 'note-result-action--disabled' : ''}`} onClick={publishing ? undefined : handlePublish}>
              <Text className='note-result-action-text note-result-action-text--publish'>{publishing ? '发布中' : '发布'}</Text>
            </View>
          </View>
        </>
      )}
    </View>
  );
}
