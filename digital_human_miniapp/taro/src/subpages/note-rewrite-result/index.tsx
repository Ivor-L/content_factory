import { View, Text, Image, ScrollView, Swiper, SwiperItem } from '@tarojs/components';
import Taro, { useDidShow, useLoad, useUnload } from '@tarojs/taro';
import { useMemo, useRef, useState } from 'react';
import { miniappApi, type MyNoteTaskDetail } from '../../utils/miniapp-api';
import './index.sass';

const RESULT_STORAGE_KEY = 'NOTE_REWRITE_RESULT_ASSETS_V1';
const RETURN_PAYLOAD_KEY = 'HOT_REWRITE_RETURN_PAYLOAD';
const IMAGE_WIDTH_RPX = 750;
const IMAGE_FALLBACK_HEIGHT_RPX = 1000;
const POLL_MS = 2800;

type ResultKind = 'infographic' | 'card-layout';

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

type ReturnPayload = {
  taskId?: string;
  mode?: string;
  kind?: ResultKind;
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

function normalizeImages(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
}

function buildQrImageSrc(text: string) {
  const value = String(text || '').trim();
  if (!value) return '';
  if (/^https?:\/\/.+\.(png|jpe?g|webp)(\?|$)/i.test(value) || /^data:image\//i.test(value)) return value;
  const base = (() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fromDefine = typeof __API_BASE_URL__ !== 'undefined' ? String((__API_BASE_URL__ as any) || '').trim() : '';
      return fromDefine.replace(/\/$/, '');
    } catch {
      return '';
    }
  })();
  const path = `/api/utils/qrcode?size=360&text=${encodeURIComponent(value)}`;
  return base ? `${base}${path}` : path;
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
  const [currentSlide, setCurrentSlide] = useState(0);
  const [resultSlide, setResultSlide] = useState(0);
  const [ratioMap, setRatioMap] = useState<Record<string, number>>({});
  const pollTimerRef = useRef<number | null>(null);
  const taskIdRef = useRef('');

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
          const detail = await miniappApi.getImageTextMyNoteTask(generatedTaskId);
          const images = normalizeImages(detail.generatedImages);
          if (images.length > 0) {
            mergeAssets({ infographic: { taskId: generatedTaskId, images } });
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
    if (kind === 'infographic') {
      mergeAssets({ infographic: { taskId: generatedTaskId, images, qrcode, url } }, targetTaskId);
      setActiveResult('infographic');
      if (images.length === 0 && generatedTaskId) pollGeneratedTask(generatedTaskId);
    } else {
      mergeAssets({ cardLayout: { taskId: generatedTaskId, images, qrcode, url } }, targetTaskId);
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
    if (stored.infographic?.images?.length && !stored.cardLayout?.images?.length) setActiveResult('infographic');
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
      setAssets(readAssetStore()[id] || {});
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
  const images = useMemo(() => {
    if (!task) return [] as string[];
    const source = task.analysisResult.sourceImages.length > 0 ? task.analysisResult.sourceImages : task.source.images;
    return source.filter(Boolean);
  }, [task]);
  const tags = useMemo(() => extractTags(rewrite), [rewrite]);
  const activeImages = activeResult === 'infographic'
    ? normalizeImages(assets.infographic?.images)
    : normalizeImages(assets.cardLayout?.images);
  const activePublish = activeResult === 'infographic' ? assets.infographic : assets.cardLayout;
  const resultTabs = [
    { key: 'infographic' as ResultKind, label: '信息卡片', count: normalizeImages(assets.infographic?.images).length },
    { key: 'card-layout' as ResultKind, label: '图文卡片', count: normalizeImages(assets.cardLayout?.images).length },
  ];

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

  const openGenerator = (targetFeature: ResultKind) => {
    if (!rewrite || !taskId) return;
    Taro.setStorageSync('MY_NOTE_REWRITE_PAYLOAD', {
      targetFeature,
      title,
      body: rewrite.body,
      imageTexts: rewrite.imageTexts,
    });
    Taro.navigateTo({
      url: `/subpages/image-generate/index?origin=hot-rewrite&taskId=${encodeURIComponent(taskId)}&mode=${encodeURIComponent(mode)}&returnPage=note-rewrite-result&targetFeature=${encodeURIComponent(targetFeature)}`,
    });
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

              <View className='note-result-section-head'>
                <Text className='note-result-section-title'>图片正文</Text>
                <View className='note-result-copy' onClick={() => copyText('图片正文', rewrite.imageTexts.join('\n\n'))}><Text className='note-result-copy-text'>复制</Text></View>
              </View>
              {rewrite.imageTexts.length > 0 ? rewrite.imageTexts.map((text, index) => (
                <Text key={`${index}-${text}`} className='note-result-image-text'>{text}</Text>
              )) : <Text className='note-result-image-text note-result-image-text--empty'>暂无图片正文</Text>}

              <View className='note-result-generated'>
                <View className='note-result-tabs'>
                  {resultTabs.map((tab) => (
                    <View key={tab.key} className={`note-result-tab ${activeResult === tab.key ? 'note-result-tab--active' : ''}`} onClick={() => {
                      setActiveResult(tab.key);
                      setResultSlide(0);
                    }}>
                      <Text className={`note-result-tab-text ${activeResult === tab.key ? 'note-result-tab-text--active' : ''}`}>{tab.label}</Text>
                      {tab.count > 0 && <Text className='note-result-tab-count'>{tab.count}</Text>}
                    </View>
                  ))}
                </View>
                {activeImages.length === 0 ? (
                  <View className='note-result-generated-empty' />
                ) : (
                  <View className='note-result-generated-swiper'>
                    <Swiper className='note-result-generated-swiper-inner' current={resultSlide} onChange={(event) => setResultSlide(event.detail.current)}>
                      {activeImages.map((url, index) => (
                        <SwiperItem key={`${url}-${index}`}>
                          <Image className='note-result-generated-image' src={url} mode='aspectFit' />
                        </SwiperItem>
                      ))}
                    </Swiper>
                    <View className='note-result-generated-indicator'><Text className='note-result-indicator-text'>{resultSlide + 1}/{activeImages.length}</Text></View>
                  </View>
                )}
                {!!activePublish?.qrcode && (
                  <View className='note-result-qrcode-card'>
                    <Text className='note-result-qrcode-title'>小红书发布二维码</Text>
                    <Image className='note-result-qrcode-image' src={buildQrImageSrc(activePublish.qrcode)} mode='aspectFit' />
                  </View>
                )}
              </View>
            </View>
          </ScrollView>

          <View className='note-result-action-bar'>
            <View className='note-result-action' onClick={() => openGenerator('infographic')}>
              <Text className='note-result-action-text'>生成信息卡片</Text>
            </View>
            <View className='note-result-action' onClick={() => openGenerator('card-layout')}>
              <Text className='note-result-action-text'>生成图文卡片</Text>
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
