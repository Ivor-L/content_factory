import { View, Text, Image, Swiper, SwiperItem, ScrollView, Video } from '@tarojs/components';
import Taro, { useLoad, useDidShow, useUnload } from '@tarojs/taro';
import { useEffect, useMemo, useRef, useState } from 'react';
import { miniappApi, type HotItem, type MyNoteTaskDetail } from '../../utils/miniapp-api';
import './index.sass';

const HOT_COVER_FALLBACK_URL = 'https://oss.atomx.top/miniapp/hot-square/fallback-cover-1777628403821.jpg';
const DETAIL_IMAGE_WIDTH_RPX = 750;
const DETAIL_IMAGE_FALLBACK_HEIGHT_RPX = 1000;
const POLL_MS = 2500;
const HOT_REMOVED_ITEMS_KEY = 'HOT_SQUARE_REMOVED_ITEMS';
const SMART_COPY_SCRIPT_PAYLOAD_KEY = 'SMART_COPY_SCRIPT_PAYLOAD';
const API_BASE_URL = getApiBaseUrl();

function formatMetric(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) return '--';
  if (value >= 10000) return `${(value / 10000).toFixed(1)}万`;
  return String(Math.round(value));
}

function normalizeStatus(status?: string | null) {
  return String(status || '').toUpperCase();
}

function isParsingStatus(status?: string | null) {
  const key = normalizeStatus(status);
  if (key.includes('REWRITE_COMPLETED')) return false;
  if (key.includes('BREAKDOWN_COMPLETED')) return false;
  if (key.includes('VIDEO_COPY_COMPLETED')) return false;
  return key.includes('BREAKDOWN_PENDING') || key.includes('VIDEO_COPY_EXTRACTING') || key.includes('PENDING') || key.includes('PROCESS');
}

function canRewriteStatus(status?: string | null) {
  const key = normalizeStatus(status);
  return key.includes('BREAKDOWN_COMPLETED') || key.includes('VIDEO_COPY_COMPLETED');
}

function formatMyTaskStatus(status: string) {
  const key = normalizeStatus(status);
  if (key.includes('BREAKDOWN_COMPLETED')) return '解析完成';
  if (key.includes('VIDEO_COLLECTED')) return '视频已采集';
  if (key.includes('VIDEO_COPY_EXTRACTING')) return '文案提取中';
  if (key.includes('VIDEO_COPY_COMPLETED')) return '文案已提取';
  if (key.includes('VIDEO_COPY_FAILED')) return '文案提取失败';
  if (isParsingStatus(key)) return '解析中';
  if (key.includes('REWRITE_PENDING')) return '仿写中';
  if (key.includes('REWRITE_COMPLETED')) return '仿写完成';
  if (key.includes('FAILED') || key.includes('ERROR')) return '解析失败';
  return key || '--';
}

function buildRewritePayload(rewrite: NonNullable<MyNoteTaskDetail['analysisResult']['rewriteResult']>, targetFeature: string) {
  return {
    targetFeature,
    title: rewrite.title,
    body: rewrite.body,
    imageTexts: rewrite.imageTexts,
  };
}

function copyTextToClipboard(label: string, content: string) {
  const text = String(content || '').trim();
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

function getApiBaseUrl(): string {
  try {
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

function buildAuthHeader(): Record<string, string> | undefined {
  const apiKey = getApiKey();
  return apiKey ? { 'x-user-api-key': apiKey } : undefined;
}

function buildDownloadUrl(url: string, mediaType: 'image' | 'video'): string {
  const filename = mediaType === 'video' ? `video-${Date.now()}.mp4` : `image-${Date.now()}.jpg`;
  const path = `/api/proxy/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}

function getDownloadErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || '');
  if (/auth|authorize|permission|scope\.writePhotosAlbum|saveVideoToPhotosAlbum/i.test(raw)) {
    return '未开启相册权限';
  }
  if (/下载失败\s*\d+/.test(raw)) return raw;
  if (/timeout|timed out/i.test(raw)) return '下载超时，请稍后重试';
  if (/url|domain|downloadFile|fail/i.test(raw)) return '视频下载失败，请稍后重试';
  return raw || '下载失败，请稍后重试';
}

async function ensureAlbumPermission(): Promise<boolean> {
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
}

function rememberRemovedHotItem(...ids: Array<string | null | undefined>) {
  try {
    const raw = Taro.getStorageSync(HOT_REMOVED_ITEMS_KEY);
    const current = raw ? JSON.parse(String(raw)) : [];
    const list = Array.isArray(current)
      ? current.map((item) => String(item || '').trim()).filter(Boolean)
      : [];
    const next = new Set(list);
    ids.map((id) => String(id || '').trim()).filter(Boolean).forEach((id) => next.add(id));
    Taro.setStorageSync(HOT_REMOVED_ITEMS_KEY, JSON.stringify(Array.from(next).slice(-100)));
  } catch {
    // ignore storage failures
  }
}

function getTitleOptions(title: string): string[] {
  const clean = title.trim() || '仿写标题';
  return [clean].filter(Boolean);
}

function getFormulaTitleOptions(rewrite: MyNoteTaskDetail['analysisResult']['rewriteResult'] | null): string[] {
  const titles = [
    ...(rewrite?.titleFormula?.top3 || []).map((item) => item.title),
    ...(rewrite?.titleFormula?.candidates || []).map((item) => item.title),
    rewrite?.title || '',
  ].map((title) => title.trim()).filter(Boolean);
  return Array.from(new Set(titles)).slice(0, 8);
}

export default function HotDetailPage() {
  const [mode, setMode] = useState<'hot' | 'my'>('hot');
  const [myTaskId, setMyTaskId] = useState('');
  const [loadError, setLoadError] = useState('');

  const [item, setItem] = useState<HotItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [collected, setCollected] = useState(false);
  const [inlineTaskId, setInlineTaskId] = useState('');
  const [inlineTask, setInlineTask] = useState<MyNoteTaskDetail | null>(null);

  const [myTask, setMyTask] = useState<MyNoteTaskDetail | null>(null);
  const [loadingMyTask, setLoadingMyTask] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [extractingVideoCopy, setExtractingVideoCopy] = useState(false);
  const [copyRemixing, setCopyRemixing] = useState(false);
  const [downloadingVideo, setDownloadingVideo] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [rewriteDrawerVisible, setRewriteDrawerVisible] = useState(false);
  const [remixDrawerVisible, setRemixDrawerVisible] = useState(false);
  const [selectedRewriteTitle, setSelectedRewriteTitle] = useState('');
  const [retryingImageIndex, setRetryingImageIndex] = useState<number | null>(null);
  const [imageRatioMap, setImageRatioMap] = useState<Record<string, number>>({});
  const [publishQrcode, setPublishQrcode] = useState('');
  const [publishUrl, setPublishUrl] = useState('');
  const [publishingRewrite, setPublishingRewrite] = useState(false);
  const pollTimerRef = useRef<number | null>(null);
  const rewriteDrawerTouchStartYRef = useRef(0);
  const rewriteDrawerTouchDeltaYRef = useRef(0);

  const clearPoll = () => {
    if (pollTimerRef.current != null) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const loadMyTask = async (taskId: string, silent = false) => {
    if (!taskId) return null;
    if (!silent) setLoadingMyTask(true);
    try {
      const detail = await miniappApi.getImageTextMyNoteTask(taskId);
      setMyTask(detail);
      return detail;
    } catch (error) {
      if (!silent) {
        Taro.showToast({ title: error instanceof Error ? error.message : '加载失败', icon: 'none' });
      }
      return null;
    } finally {
      if (!silent) setLoadingMyTask(false);
    }
  };

  const pollTask = (taskId: string, target: 'my' | 'inline') => {
    clearPoll();
    pollTimerRef.current = setInterval(() => {
      void (async () => {
        try {
          const detail = await miniappApi.getImageTextMyNoteTask(taskId);
          if (target === 'my') setMyTask(detail);
          if (target === 'inline') setInlineTask(detail);
          const status = normalizeStatus(detail.status);
          const isTerminal = status.includes('BREAKDOWN_COMPLETED') || status.includes('VIDEO_COPY_COMPLETED') || status.includes('REWRITE_COMPLETED') || status.includes('FAILED') || status.includes('ERROR');
          if (isTerminal && !isParsingStatus(status)) clearPoll();
        } catch {
          // Keep polling while network is flaky; the task is persisted server-side.
        }
      })();
    }, POLL_MS) as unknown as number;
  };

  useLoad((query) => {
    const nextMode = query?.mode === 'my' || query?.myTaskId ? 'my' : 'hot';
    setMode(nextMode);
    setLoadError('');

    if (nextMode === 'my') {
      const taskId = String(query?.myTaskId || '').trim();
      setMyTaskId(taskId);
      setCollected(true);
      if (taskId) {
        void loadMyTask(taskId);
        pollTask(taskId, 'my');
      }
      return;
    }

    const cached = Taro.getStorageSync('HOT_DETAIL_ITEM') as HotItem | null;
    if (cached && (!query?.id || String(cached.id) === String(query.id))) {
      setItem(cached);
      setCollected(Boolean(cached.isCollected || cached.source === 'mine'));
      return;
    }

    setLoadError('详情数据已失效，请返回爆款列表重新进入');
  });

  useDidShow(() => {
    if (mode === 'my' && myTaskId) {
      void loadMyTask(myTaskId, true);
      if (!pollTimerRef.current && isParsingStatus(myTask?.status)) pollTask(myTaskId, 'my');
    }
    if (mode === 'hot' && inlineTaskId) {
      void (async () => {
        const detail = await miniappApi.getImageTextMyNoteTask(inlineTaskId);
        setInlineTask(detail);
        if (!pollTimerRef.current && isParsingStatus(detail.status)) pollTask(inlineTaskId, 'inline');
      })();
    }
    const returned = Taro.getStorageSync('HOT_REWRITE_RETURN_PAYLOAD');
    if (returned && typeof returned === 'object') {
      const payload = returned as { taskId?: string; qrcode?: string; url?: string };
      const taskId = String(payload.taskId || '').trim();
      if (!taskId || taskId === activeTaskId) {
        Taro.navigateTo({
          url: `/subpages/note-rewrite-result/index?taskId=${encodeURIComponent(taskId || activeTaskId)}&mode=${encodeURIComponent(mode)}`,
        });
      }
    }
  });

  useUnload(() => clearPoll());

  useEffect(() => () => clearPoll(), []);

  const activeTask = mode === 'my' ? myTask : inlineTask;
  const activeTaskId = mode === 'my' ? myTaskId : inlineTaskId;
  const rewrite = activeTask?.analysisResult?.rewriteResult || null;
  const rewriteTitleOptions = useMemo(() => {
    const formulaOptions = getFormulaTitleOptions(rewrite);
    return formulaOptions.length > 0 ? formulaOptions : getTitleOptions(rewrite?.title || '');
  }, [rewrite]);
  const taskCanRewrite = Boolean(activeTask && canRewriteStatus(activeTask.status));
  const hasRewriteResult = Boolean(rewrite);
  const isParsing = Boolean(activeTask && isParsingStatus(activeTask.status));
  const activeVideoUrl = mode === 'my'
    ? (myTask?.source.videoUrl || '')
    : (inlineTask?.source.videoUrl || item?.videoUrl || '');
  const isVideoNote = Boolean(activeVideoUrl || item?.sourceType === 'video' || myTask?.source.sourceType === 'video');
  const videoCanRewrite = Boolean(isVideoNote && activeTask && (taskCanRewrite || hasRewriteResult));
  const videoCopyText = useMemo(() => {
    const text = mode === 'my'
      ? myTask?.source.text
      : (inlineTask?.source.text || item?.scriptText || item?.description);
    return String(text || '').trim();
  }, [inlineTask?.source.text, item?.description, item?.scriptText, mode, myTask?.source.text]);
  const videoTitle = mode === 'my'
    ? (myTask?.source.title || '爆款视频')
    : (item?.title || inlineTask?.source.title || '爆款视频');

  const coverUrl = useMemo(() => {
    const raw = typeof item?.coverUrl === 'string' ? item.coverUrl.trim() : '';
    return raw || HOT_COVER_FALLBACK_URL;
  }, [item]);

  const detailImages = useMemo(() => {
    const list = Array.isArray(item?.mediaUrls)
      ? item.mediaUrls.map((url) => (typeof url === 'string' ? url.trim() : '')).filter(Boolean)
      : [];
    if (list.length > 0) return list;
    return [coverUrl];
  }, [coverUrl, item?.mediaUrls]);

  const myImages = useMemo(() => {
    if (!myTask) return [] as string[];
    if (Array.isArray(myTask.analysisResult?.sourceImages) && myTask.analysisResult.sourceImages.length > 0) return myTask.analysisResult.sourceImages;
    return myTask.source?.images || [];
  }, [myTask]);

  useEffect(() => {
    const length = mode === 'my' ? Math.max(myImages.length, 1) : detailImages.length;
    if (currentSlide > length - 1) setCurrentSlide(0);
  }, [currentSlide, detailImages.length, mode, myImages.length]);

  const handleBack = () => {
    clearPoll();
    Taro.navigateBack({ delta: 1 });
  };

  const handleParseCurrent = async () => {
    if (!item || creating || inlineTaskId) return;
    setCreating(true);
    try {
      const result = await miniappApi.startOneClickCreate(item);
      setInlineTaskId(result.taskId);
      setCollected(true);
      const detail = await miniappApi.getImageTextMyNoteTask(result.taskId);
      setInlineTask(detail);
      pollTask(result.taskId, 'inline');
      Taro.showToast({ title: '已加入我的，正在解析', icon: 'none' });
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '解析失败', icon: 'none' });
    } finally {
      setCreating(false);
    }
  };

  const handleCancelCollect = async () => {
    if (removing) return;
    setRemoving(true);
    try {
      if (mode === 'my' && myTaskId) {
        await miniappApi.removeHotMyNote({
          id: myTaskId,
          sourceId: myTask?.source.sourceId || undefined,
          sourceUrl: myTask?.source.sourceUrl || undefined,
        });
        rememberRemovedHotItem(myTaskId, myTask?.source.sourceId, myTask?.source.sourceUrl);
        clearPoll();
        setMyTask(null);
        setCollected(false);
        Taro.showToast({ title: '已取消收藏', icon: 'none' });
        setTimeout(() => Taro.navigateBack({ delta: 1 }), 300);
        return;
      }

      if (inlineTaskId) {
        await miniappApi.removeHotMyNote({
          id: inlineTaskId,
          sourceId: inlineTask?.source.sourceId || undefined,
          sourceUrl: inlineTask?.source.sourceUrl || undefined,
        });
        rememberRemovedHotItem(inlineTaskId, item?.id, item?.sourceUrl);
        setInlineTaskId('');
        setInlineTask(null);
        setCollected(false);
        clearPoll();
        Taro.showToast({ title: '已取消收藏', icon: 'none' });
        return;
      }

      if (item?.referenceId) {
        await miniappApi.removeViralReference(item.referenceId);
        rememberRemovedHotItem(item.id, item.referenceId, item.sourceUrl);
        Taro.showToast({ title: '已取消收藏', icon: 'none' });
        setTimeout(() => Taro.navigateBack({ delta: 1 }), 300);
        return;
      }

      if (item) {
        await miniappApi.removeHotMyNote({ sourceId: item.id, sourceUrl: item.sourceUrl || undefined });
        rememberRemovedHotItem(item.id, item.myTaskId, item.referenceId, item.sourceUrl);
        setCollected(false);
        Taro.showToast({ title: '已取消收藏', icon: 'none' });
      }
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '取消失败', icon: 'none' });
    } finally {
      setRemoving(false);
    }
  };

  const handleRewrite = async () => {
    if (!activeTaskId || rewriting || !taskCanRewrite) return;
    setRewriting(true);
    try {
      await miniappApi.triggerImageTextMyNoteRewrite(activeTaskId);
      const latest = await miniappApi.getImageTextMyNoteTask(activeTaskId);
      if (mode === 'my') setMyTask(latest);
      if (mode === 'hot') setInlineTask(latest);
      const latestRewrite = latest.analysisResult.rewriteResult;
      if (latestRewrite) Taro.setStorageSync('MY_NOTE_REWRITE_PAYLOAD', buildRewritePayload(latestRewrite, 'card-layout'));
      setSelectedRewriteTitle(latestRewrite?.title || '');
      if (latestRewrite) {
        Taro.navigateTo({
          url: `/subpages/note-rewrite-result/index?taskId=${encodeURIComponent(activeTaskId)}&mode=${encodeURIComponent(mode)}`,
        });
      }
      Taro.showToast({ title: '仿写完成', icon: 'success' });
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '仿写失败', icon: 'none' });
    } finally {
      setRewriting(false);
    }
  };

  const handleRouteToCardLayout = (targetFeature: 'card-layout' | 'infographic') => {
    if (!rewrite) return;
    Taro.setStorageSync('MY_NOTE_REWRITE_PAYLOAD', buildRewritePayload({
      ...rewrite,
      title: selectedRewriteTitle || rewrite.title,
    }, targetFeature));
    const query = [
      'origin=hot-rewrite',
      activeTaskId ? `taskId=${encodeURIComponent(activeTaskId)}` : '',
      `mode=${encodeURIComponent(mode)}`,
    ].filter(Boolean).join('&');
    Taro.navigateTo({ url: `/subpages/image-generate/index?${query}` });
  };

  const handleOpenRewriteDrawer = () => {
    if (!rewrite) return;
    setSelectedRewriteTitle((current) => current || rewrite.title || rewriteTitleOptions[0] || '');
    Taro.navigateTo({
      url: `/subpages/note-rewrite-result/index?taskId=${encodeURIComponent(activeTaskId)}&mode=${encodeURIComponent(mode)}`,
    });
  };

  const handleRewriteDrawerTouchStart = (event: any) => {
    const touch = event?.touches?.[0] || event?.changedTouches?.[0];
    rewriteDrawerTouchStartYRef.current = typeof touch?.clientY === 'number' ? touch.clientY : 0;
    rewriteDrawerTouchDeltaYRef.current = 0;
  };

  const handleRewriteDrawerTouchMove = (event: any) => {
    const touch = event?.touches?.[0] || event?.changedTouches?.[0];
    if (!touch || !rewriteDrawerTouchStartYRef.current) return;
    rewriteDrawerTouchDeltaYRef.current = touch.clientY - rewriteDrawerTouchStartYRef.current;
  };

  const handleRewriteDrawerTouchEnd = () => {
    if (rewriteDrawerTouchDeltaYRef.current > 72) {
      setRewriteDrawerVisible(false);
    }
    rewriteDrawerTouchStartYRef.current = 0;
    rewriteDrawerTouchDeltaYRef.current = 0;
  };

  const handleExtractVideoCopy = async () => {
    let taskId = activeTaskId || myTaskId || inlineTaskId;
    if (!taskId && mode === 'hot' && item) {
      try {
        setCreating(true);
        const result = await miniappApi.startOneClickCreate(item);
        taskId = result.taskId;
        setInlineTaskId(result.taskId);
        setCollected(true);
        const detail = await miniappApi.getImageTextMyNoteTask(result.taskId);
        setInlineTask(detail);
      } catch (error) {
        Taro.showToast({ title: error instanceof Error ? error.message : '加入我的失败', icon: 'none' });
        setCreating(false);
        return;
      } finally {
        setCreating(false);
      }
    }
    if (!taskId || extractingVideoCopy) return;
    setExtractingVideoCopy(true);
    try {
      const result = await miniappApi.extractMyNoteVideoCopy(taskId);
      const latest = await miniappApi.getImageTextMyNoteTask(taskId);
      if (mode === 'my') setMyTask(latest);
      if (mode === 'hot') setInlineTask(latest);
      if (isParsingStatus(latest.status)) pollTask(taskId, mode === 'my' ? 'my' : 'inline');
      Taro.showToast({ title: result.text || latest.source.text ? '文案已提取' : '已开始后台提取', icon: 'none' });
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '提取失败', icon: 'none' });
    } finally {
      setExtractingVideoCopy(false);
    }
  };

  const handleDownloadVideo = async () => {
    if (!activeVideoUrl || downloadingVideo) return;
    const granted = await ensureAlbumPermission();
    if (!granted) {
      Taro.showToast({ title: '未开启相册权限', icon: 'none' });
      return;
    }

    setDownloadingVideo(true);
    try {
      const res = await Taro.downloadFile({
        url: buildDownloadUrl(activeVideoUrl, 'video'),
        header: buildAuthHeader(),
      });
      if (res.statusCode && res.statusCode >= 400) throw new Error(`下载失败 ${res.statusCode}`);
      if (!res.tempFilePath) throw new Error('下载失败');
      await Taro.saveVideoToPhotosAlbum({ filePath: res.tempFilePath });
      Taro.showToast({ title: '已保存到相册', icon: 'success' });
    } catch (error) {
      const message = getDownloadErrorMessage(error);
      Taro.showToast({ title: message, icon: 'none' });
    } finally {
      setDownloadingVideo(false);
    }
  };

  const handleOpenRemix = (type: 'short' | 'long' | 'action-swap') => {
    if (!activeVideoUrl) return;
    const params = [
      `referenceVideoUrl=${encodeURIComponent(activeVideoUrl)}`,
      'fromHotNote=1',
      `title=${encodeURIComponent((mode === 'my' ? myTask?.source.title : item?.title) || '爆款视频')}`,
    ];
    if (type === 'long') params.push('duration=long');
    if (type === 'action-swap') params.push('mode=action-swap');
    Taro.navigateTo({ url: `/subpages/remix-generate/index?${params.join('&')}` });
    setRemixDrawerVisible(false);
  };

  const handleCreateDigitalHumanFromCopy = () => {
    if (!videoCopyText) {
      Taro.showToast({ title: '请先提取口播文案', icon: 'none' });
      return;
    }
    Taro.setStorageSync(SMART_COPY_SCRIPT_PAYLOAD_KEY, {
      script: videoCopyText,
      title: videoTitle,
      source: 'hot-video-copy',
      taskId: activeTaskId || '',
      videoUrl: activeVideoUrl || '',
    });
    Taro.navigateTo({ url: '/subpages/generate/index?from=smart-copy&feature=digital-human' });
    setRemixDrawerVisible(false);
  };

  const handleCopyVideoCopy = () => {
    copyTextToClipboard('口播文案', videoCopyText);
  };

  const handleVideoCopyRemix = async () => {
    if (copyRemixing) return;
    if (!activeVideoUrl) {
      Taro.showToast({ title: '缺少视频地址', icon: 'none' });
      return;
    }
    if (!videoCopyText) {
      Taro.showToast({ title: '请先提取口播文案', icon: 'none' });
      return;
    }

    setCopyRemixing(true);
    try {
      const styles = await miniappApi.listWritingStyles(50);
      if (styles.length === 0) {
        Taro.showToast({ title: '请先在 Web 端创建写作风格', icon: 'none' });
        return;
      }
      const result = await Taro.showActionSheet({
        itemList: styles.map((style) => style.name.slice(0, 16) || '未命名风格'),
      });
      const picked = styles[result.tapIndex] || styles[0];
      await miniappApi.createVideoCopyRemix({
        videoUrl: activeVideoUrl,
        originalCopy: videoCopyText,
        styleId: picked.id,
        sourceTitle: videoTitle,
        sourceText: videoCopyText,
        ideaText: `基于这段爆款口播文案做二创，保留结构和节奏，换成所选写作风格：\n\n${videoCopyText}`,
      });
      Taro.showToast({ title: '二创任务已提交', icon: 'success' });
      Taro.switchTab({ url: '/pages/works/index' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '');
      if (!/cancel/i.test(message)) {
        Taro.showToast({ title: message || '二创失败', icon: 'none' });
      }
    } finally {
      setCopyRemixing(false);
    }
  };

  const handleCopyExtractedTexts = (texts: Array<{ index: number; text?: string | null }>) => {
    const content = texts
      .map((textItem) => String(textItem.text || '').trim())
      .filter(Boolean)
      .join('\n\n');

    if (!content) {
      Taro.showToast({ title: '暂无可复制文案', icon: 'none' });
      return;
    }

    Taro.setClipboardData({
      data: content,
      success: () => {
        Taro.showToast({ title: '文案已复制', icon: 'success' });
      },
      fail: () => {
        Taro.showToast({ title: '复制失败', icon: 'none' });
      },
    });
  };

  const handlePublishRewrite = async () => {
    if (!rewrite || publishingRewrite) return;
    const activeTitle = selectedRewriteTitle || rewrite.title || rewriteTitleOptions[0] || '小红书图文';
    const images = mode === 'my' ? myImages : detailImages;
    const publishImages = images.filter(Boolean);
    if (publishImages.length === 0) {
      Taro.showToast({ title: '暂无可发布图片', icon: 'none' });
      return;
    }
    setPublishingRewrite(true);
    try {
      const content = [
        rewrite.body,
        rewrite.imageTexts.join('\n\n'),
      ].filter(Boolean).join('\n\n').slice(0, 1000);
      const result = await miniappApi.publishXhsLayout({
        title: activeTitle,
        content,
        images: publishImages,
        taskId: activeTaskId,
      });
      setPublishQrcode(result.qrcode || '');
      setPublishUrl(result.url || '');
      if (result.qrcode) {
        Taro.setStorageSync('HOT_REWRITE_RETURN_PAYLOAD', {
          taskId: activeTaskId,
          mode,
          kind: 'card-layout',
          qrcode: result.qrcode || '',
          url: result.url || '',
        });
        Taro.navigateTo({
          url: `/subpages/note-rewrite-result/index?taskId=${encodeURIComponent(activeTaskId)}&mode=${encodeURIComponent(mode)}`,
        });
      } else {
        Taro.showToast({ title: '发布请求已提交', icon: 'success' });
      }
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '发布失败', icon: 'none' });
    } finally {
      setPublishingRewrite(false);
    }
  };

  const handleRetryImageText = async (imageIndex: number) => {
    if (!myTaskId || retryingImageIndex) return;
    setRetryingImageIndex(imageIndex);
    try {
      await miniappApi.retryImageTextMyNoteBreakdown(myTaskId, imageIndex);
      const latest = await loadMyTask(myTaskId, true);
      if (latest && isParsingStatus(latest.status)) pollTask(myTaskId, 'my');
      Taro.showToast({ title: '已重试该张识别', icon: 'none' });
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '重试失败', icon: 'none' });
    } finally {
      setRetryingImageIndex(null);
    }
  };

  const rememberImageRatio = (url: string, width?: number, height?: number) => {
    if (!url || !width || !height || width <= 0 || height <= 0) return;
    const ratio = height / width;
    setImageRatioMap((prev) => {
      if (Math.abs((prev[url] || 0) - ratio) < 0.001) return prev;
      return { ...prev, [url]: ratio };
    });
  };

  const getImageDisplayHeight = (url: string) => {
    const ratio = imageRatioMap[url];
    if (!ratio || ratio <= 0) return DETAIL_IMAGE_FALLBACK_HEIGHT_RPX;
    return Math.round(DETAIL_IMAGE_WIDTH_RPX * ratio);
  };

  const renderMedia = (images: string[]) => {
    if (activeVideoUrl) {
      const posterUrl = images.find((url) => Boolean(String(url || '').trim())) || coverUrl || HOT_COVER_FALLBACK_URL;
      return (
        <View className='hot-detail-video-wrap'>
          <Video
            className='hot-detail-video'
            src={activeVideoUrl}
            poster={posterUrl}
            controls
            autoplay={false}
            loop={false}
            showFullscreenBtn
            showPlayBtn
            objectFit='cover'
          />
        </View>
      );
    }
    const safeImages = images.length > 0 ? images : [HOT_COVER_FALLBACK_URL];
    if (safeImages.length > 1) {
      const activeImage = safeImages[Math.max(0, Math.min(currentSlide, safeImages.length - 1))] || safeImages[0];
      const swiperHeight = `${getImageDisplayHeight(activeImage)}rpx`;
      return (
        <View className='hot-detail-swiper-wrap' style={{ height: swiperHeight }}>
          <Swiper className='hot-detail-swiper' style={{ height: swiperHeight }} indicatorDots={false} circular={false} current={currentSlide} onChange={(e) => setCurrentSlide(e.detail.current)}>
            {safeImages.map((url, index) => (
              <SwiperItem key={`${url}-${index}`}>
                <Image
                  className='hot-detail-cover hot-detail-cover--natural'
                  src={url}
                  mode='widthFix'
                  onLoad={(event) => rememberImageRatio(url, event.detail.width, event.detail.height)}
                />
              </SwiperItem>
            ))}
          </Swiper>
          <View className='hot-detail-swiper-indicator'>
            <Text className='hot-detail-swiper-indicator-text'>{currentSlide + 1}/{safeImages.length}</Text>
          </View>
        </View>
      );
    }
    return <Image className='hot-detail-cover hot-detail-cover--single' src={safeImages[0]} mode='widthFix' />;
  };

  const renderStats = (stats: { likes?: number | null; collects?: number | null; comments?: number | null; shares?: number | null }) => (
    <View className='hot-detail-stats'>
      <View className='hot-detail-stat'><Text className='hot-detail-stat-icon'>♡</Text><Text className='hot-detail-stat-text'>{formatMetric(stats.likes)}</Text></View>
      <View className='hot-detail-stat'><Text className='hot-detail-stat-icon'>☆</Text><Text className='hot-detail-stat-text'>{formatMetric(stats.collects)}</Text></View>
      <View className='hot-detail-stat'><Text className='hot-detail-stat-icon'>评</Text><Text className='hot-detail-stat-text'>{formatMetric(stats.comments)}</Text></View>
      <View className='hot-detail-stat'><Text className='hot-detail-stat-icon'>↗</Text><Text className='hot-detail-stat-text'>{formatMetric(stats.shares)}</Text></View>
    </View>
  );

  const renderRewriteDrawer = () => {
    if (!rewrite || !rewriteDrawerVisible) return null;
    const activeTitle = selectedRewriteTitle || rewrite.title || rewriteTitleOptions[0] || '';
    return (
      <View className='hot-rewrite-layer' catchMove onClick={() => setRewriteDrawerVisible(false)}>
        <View className='hot-rewrite-mask' catchMove />
        <View
          className='hot-rewrite-drawer'
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          <View
            className='hot-rewrite-grabber'
            onTouchStart={handleRewriteDrawerTouchStart}
            onTouchMove={handleRewriteDrawerTouchMove}
            onTouchEnd={handleRewriteDrawerTouchEnd}
            onTouchCancel={handleRewriteDrawerTouchEnd}
          >
            <View className='hot-rewrite-handle' />
          </View>
          <View className='hot-rewrite-content-shell'>
            <ScrollView scrollY className='hot-rewrite-content'>
              <View className='hot-rewrite-content-inner'>
                <Text className='hot-rewrite-kicker'>仿写结果</Text>
                <View className='hot-rewrite-section-head'>
                  <Text className='hot-rewrite-section-title hot-rewrite-section-title--inline'>标题</Text>
                  <View className='hot-rewrite-copy' onClick={() => copyTextToClipboard('标题', activeTitle)}>
                    <Text className='hot-rewrite-copy-text'>复制</Text>
                  </View>
                </View>
                <Text className='hot-rewrite-main-title'>{activeTitle}</Text>
                <View className='hot-rewrite-title-grid'>
                  {rewriteTitleOptions.map((title) => (
                    <View
                      key={title}
                      className={`hot-rewrite-title-chip ${activeTitle === title ? 'hot-rewrite-title-chip--active' : ''}`}
                      onClick={() => setSelectedRewriteTitle(title)}
                    >
                      <Text className={`hot-rewrite-title-chip-text ${activeTitle === title ? 'hot-rewrite-title-chip-text--active' : ''}`}>{title}</Text>
                    </View>
                  ))}
                </View>
                <View className='hot-rewrite-section-head'>
                  <Text className='hot-rewrite-section-title'>正文</Text>
                  <View className='hot-rewrite-copy' onClick={() => copyTextToClipboard('正文', rewrite.body || '')}>
                    <Text className='hot-rewrite-copy-text'>复制</Text>
                  </View>
                </View>
                <Text className='hot-rewrite-body'>{rewrite.body || '--'}</Text>
                <View className='hot-rewrite-section-head'>
                  <Text className='hot-rewrite-section-title'>图文正文</Text>
                  <View className='hot-rewrite-copy' onClick={() => copyTextToClipboard('图文正文', rewrite.imageTexts.join('\n\n'))}>
                    <Text className='hot-rewrite-copy-text'>复制</Text>
                  </View>
                </View>
                {rewrite.imageTexts.length > 0 ? rewrite.imageTexts.map((text, index) => (
                  <Text key={`${index}-${text}`} className='hot-rewrite-image-text'>{text}</Text>
                )) : <Text className='hot-rewrite-image-text'>暂无图片正文</Text>}
                {!!publishQrcode && (
                  <View className='hot-rewrite-qrcode-card'>
                    <Text className='hot-rewrite-qrcode-title'>小红书发布二维码</Text>
                    <Text className='hot-rewrite-qrcode-link'>{publishQrcode}</Text>
                    {!!publishUrl && <Text className='hot-rewrite-qrcode-link'>发布链接：{publishUrl}</Text>}
                    <View className='hot-rewrite-qrcode-copy' onClick={() => copyTextToClipboard('二维码链接', publishQrcode)}>
                      <Text className='hot-rewrite-qrcode-copy-text'>复制二维码链接</Text>
                    </View>
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
          <View className='hot-rewrite-footer'>
            <View className='hot-rewrite-actions'>
              <View className='hot-rewrite-action' onClick={() => handleRouteToCardLayout('infographic')}>
                <Text className='hot-rewrite-action-icon'>▦</Text>
                <Text className='hot-rewrite-action-text'>生成信息卡片</Text>
              </View>
              <View className='hot-rewrite-action' onClick={() => handleRouteToCardLayout('card-layout')}>
                <Text className='hot-rewrite-action-icon'>▧</Text>
                <Text className='hot-rewrite-action-text'>生成图文卡片</Text>
              </View>
              <View className={`hot-rewrite-action hot-rewrite-action--publish ${publishingRewrite ? 'hot-rewrite-action--disabled' : ''}`} onClick={publishingRewrite ? undefined : handlePublishRewrite}>
                <Text className='hot-rewrite-action-icon'>↗</Text>
                <Text className='hot-rewrite-action-text'>{publishingRewrite ? '发布中...' : '发布'}</Text>
              </View>
            </View>
            <View className='hot-rewrite-close' onClick={() => setRewriteDrawerVisible(false)}>
              <Text className='hot-rewrite-close-text'>关闭</Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderVideoActions = () => {
    if (!isVideoNote || !activeVideoUrl) return null;
    return (
      <View className='hot-video-actions-panel'>
        <Text className='hot-video-actions-title'>视频笔记能力</Text>
        <View className='hot-video-actions-grid'>
          <View className={`hot-video-action ${extractingVideoCopy || creating ? 'hot-video-action--disabled' : ''}`} onClick={handleExtractVideoCopy}>
            <Text className='hot-video-action-icon'>≡</Text>
            <Text className='hot-video-action-text'>{extractingVideoCopy || creating ? '提取中...' : '提取文案'}</Text>
          </View>
          <View className={`hot-video-action ${(!videoCanRewrite && !hasRewriteResult) || rewriting ? 'hot-video-action--disabled' : ''}`} onClick={hasRewriteResult ? handleOpenRewriteDrawer : (!videoCanRewrite || rewriting ? undefined : handleRewrite)}>
            <Text className='hot-video-action-icon'>✎</Text>
            <Text className='hot-video-action-text'>{hasRewriteResult ? '仿写结果' : (rewriting ? '仿写中...' : (videoCanRewrite ? '一键仿写' : '先提文案'))}</Text>
          </View>
          <View className={`hot-video-action ${downloadingVideo ? 'hot-video-action--disabled' : ''}`} onClick={handleDownloadVideo}>
            <Text className='hot-video-action-icon'>↓</Text>
            <Text className='hot-video-action-text'>{downloadingVideo ? '下载中...' : '下载视频'}</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderRemixDrawer = () => {
    if (!remixDrawerVisible || !activeVideoUrl) return null;
    return (
      <View className='hot-remix-layer'>
        <View className='hot-remix-mask' onClick={() => setRemixDrawerVisible(false)} />
        <View className='hot-remix-drawer'>
          <View className='hot-rewrite-handle' />
          <Text className='hot-remix-title'>选择复刻类型</Text>
          <Text className='hot-remix-desc'>会自动把当前视频放入参考视频，进入后可继续选角色和产品。</Text>
          <View className='hot-remix-option' onClick={() => handleOpenRemix('long')}>
            <Text className='hot-remix-option-title'>智能复刻</Text>
            <Text className='hot-remix-option-desc'>拆解参考视频，选择产品后生成同款结构视频</Text>
          </View>
          <View className='hot-remix-option' onClick={() => handleOpenRemix('action-swap')}>
            <Text className='hot-remix-option-title'>动作复刻</Text>
            <Text className='hot-remix-option-desc'>保留动作节奏，替换成你的角色</Text>
          </View>
          <View className={`hot-remix-option ${!videoCopyText ? 'hot-remix-option--disabled' : ''}`} onClick={handleCreateDigitalHumanFromCopy}>
            <Text className='hot-remix-option-title'>数字人视频</Text>
            <Text className='hot-remix-option-desc'>把提取出的口播文案导入数字人，快速生成文字驱动视频</Text>
          </View>
          <View className='hot-rewrite-close' onClick={() => setRemixDrawerVisible(false)}>
            <Text className='hot-rewrite-close-text'>关闭</Text>
          </View>
        </View>
      </View>
    );
  };

  if (mode === 'my') {
    const extractedTexts = myTask?.analysisResult?.extractedImageTexts || [];
    const statusLabel = formatMyTaskStatus(myTask?.status || '');
    return (
      <View className='hot-detail-page'>
        <View className='hot-detail-nav'>
          <View className='hot-detail-back' onClick={handleBack}><Text className='hot-detail-back-icon'>‹</Text></View>
          <Text className='hot-detail-nav-title'>我的笔记</Text>
          <View className='hot-detail-nav-spacer' />
        </View>

        {!myTask && loadingMyTask ? (
          <View className='hot-detail-empty'><Text className='hot-detail-empty-text'>加载中...</Text></View>
        ) : !myTask ? (
          <View className='hot-detail-empty'><Text className='hot-detail-empty-text'>未找到笔记任务</Text></View>
        ) : (
          <ScrollView scrollY className='hot-detail-content'>
            {renderMedia(myImages)}
            <View className='hot-detail-body'>
              <Text className='hot-detail-title'>{myTask.source.title || '未命名笔记'}</Text>
              <View className='hot-detail-author-row'>
                <Image className='hot-detail-avatar' src={myTask.source.creatorAvatarUrl || HOT_COVER_FALLBACK_URL} mode='aspectFill' />
                <Text className='hot-detail-author'>{myTask.source.creatorName || '匿名作者'}</Text>
                <Text className='hot-detail-status'>{statusLabel}</Text>
              </View>
              {renderStats(myTask.source)}
              {renderVideoActions()}
              {isVideoNote && (
                <View className='hot-video-copy-section'>
                  <View className='hot-video-copy-head'>
                    <Text className='hot-video-copy-title'>口播文案</Text>
                    <View className='hot-video-copy-actions'>
                      <View className={`hot-video-copy-action ${!videoCopyText ? 'hot-video-copy-action--disabled' : ''}`} onClick={handleCopyVideoCopy}>
                        <Text className='hot-video-copy-action-text'>复制</Text>
                      </View>
                      <View className={`hot-video-copy-action hot-video-copy-action--primary ${!videoCopyText || copyRemixing ? 'hot-video-copy-action--disabled' : ''}`} onClick={handleVideoCopyRemix}>
                        <Text className='hot-video-copy-action-text hot-video-copy-action-text--primary'>{copyRemixing ? '提交中' : '一键二创'}</Text>
                      </View>
                    </View>
                  </View>
                  <Text className='hot-video-copy-text'>{videoCopyText || '提取成功后会显示口播文案'}</Text>
                </View>
              )}
              {!isVideoNote && !!myTask.source.text && <Text className='hot-detail-desc'>{myTask.source.text}</Text>}

              {!isVideoNote && <View className='hot-my-section'>
                <View className='hot-my-section-header'>
                  <Text className='hot-my-section-title'>图片文案提取</Text>
                  {extractedTexts.length > 0 && (
                    <View className='hot-my-copy-btn' onClick={() => handleCopyExtractedTexts(extractedTexts)}>
                      <Text className='hot-my-copy-btn-text'>复制</Text>
                    </View>
                  )}
                </View>
                <View className='hot-my-text-panel'>
                  {extractedTexts.length === 0 ? (
                    <Text className='hot-my-empty'>解析中，支持关闭页面后台继续运行</Text>
                  ) : (
                    extractedTexts.map((textItem) => {
                      const failed = !textItem.success;
                      const retrying = retryingImageIndex === textItem.index;
                      return (
                        <View
                          key={`${textItem.index}`}
                          className={`hot-my-item-row ${failed ? 'hot-my-item-row--failed' : ''} ${retrying ? 'hot-my-item-row--loading' : ''}`}
                          onClick={failed && !retrying ? () => handleRetryImageText(textItem.index) : undefined}
                        >
                          <Text className={`hot-my-item-text ${failed ? 'hot-my-item-text--failed' : ''}`}>
                            {retrying ? '重试中...' : (failed ? '失败失败，点击重试' : (textItem.text || '[空]'))}
                          </Text>
                        </View>
                      );
                    })
                  )}
                </View>
              </View>}

            </View>
          </ScrollView>
        )}

        {!!myTask && (
          <View className='hot-detail-action-bar hot-detail-action-bar--my'>
            <View className='hot-detail-fav-btn hot-detail-action-btn hot-detail-fav-btn--active' onClick={handleCancelCollect}>
              <Text className='hot-detail-fav-btn-text hot-detail-fav-btn-text--active'>{removing ? '取消中...' : '已收藏'}</Text>
            </View>
            {isVideoNote ? (
              <View className='hot-detail-create-btn hot-detail-action-btn' onClick={() => setRemixDrawerVisible(true)}>
                <Text className='hot-detail-create-btn-text'>一键复刻</Text>
              </View>
            ) : (
              <View
                className={`hot-detail-create-btn hot-detail-action-btn ${(!taskCanRewrite && !hasRewriteResult) || rewriting ? 'hot-detail-create-btn--disabled' : ''}`}
                onClick={hasRewriteResult ? handleOpenRewriteDrawer : (!taskCanRewrite || rewriting ? undefined : handleRewrite)}
              >
                <Text className='hot-detail-create-btn-text'>{hasRewriteResult ? '查看仿写结果' : (rewriting ? '仿写中...' : (taskCanRewrite ? '一键仿写' : '正在解析中'))}</Text>
              </View>
            )}
          </View>
        )}
        {renderRewriteDrawer()}
        {renderRemixDrawer()}
      </View>
    );
  }

  return (
    <View className='hot-detail-page'>
      <View className='hot-detail-nav'>
        <View className='hot-detail-back' onClick={handleBack}><Text className='hot-detail-back-icon'>‹</Text></View>
        <Text className='hot-detail-nav-title'>爆款详情</Text>
        <View className='hot-detail-nav-spacer' />
      </View>

      {!item ? (
        <View className='hot-detail-empty'><Text className='hot-detail-empty-text'>{loadError || '未找到内容，请返回重试'}</Text></View>
      ) : (
        <>
          <ScrollView scrollY className='hot-detail-content'>
            {renderMedia(detailImages)}
            <View className='hot-detail-body'>
              <Text className='hot-detail-title'>{item.title || '未命名内容'}</Text>
              <View className='hot-detail-author-row'>
                <Image className='hot-detail-avatar' src={item.creatorAvatarUrl || HOT_COVER_FALLBACK_URL} mode='aspectFill' />
                <Text className='hot-detail-author'>{item.creatorName || '匿名作者'}</Text>
                {activeTask && <Text className='hot-detail-status'>{formatMyTaskStatus(activeTask.status)}</Text>}
              </View>
              {renderStats(item)}
              {renderVideoActions()}
              {isVideoNote && (
                <View className='hot-video-copy-section'>
                  <View className='hot-video-copy-head'>
                    <Text className='hot-video-copy-title'>口播文案</Text>
                    <View className='hot-video-copy-actions'>
                      <View className={`hot-video-copy-action ${!videoCopyText ? 'hot-video-copy-action--disabled' : ''}`} onClick={handleCopyVideoCopy}>
                        <Text className='hot-video-copy-action-text'>复制</Text>
                      </View>
                      <View className={`hot-video-copy-action hot-video-copy-action--primary ${!videoCopyText || copyRemixing ? 'hot-video-copy-action--disabled' : ''}`} onClick={handleVideoCopyRemix}>
                        <Text className='hot-video-copy-action-text hot-video-copy-action-text--primary'>{copyRemixing ? '提交中' : '一键二创'}</Text>
                      </View>
                    </View>
                  </View>
                  <Text className='hot-video-copy-text'>{videoCopyText || '提取成功后会显示口播文案'}</Text>
                </View>
              )}
              {!isVideoNote && !!item.description && <Text className='hot-detail-desc'>{item.description}</Text>}
              {inlineTask && isParsing && <Text className='hot-detail-inline-tip'>正在解析图文，完成后可直接一键仿写。</Text>}
            </View>
          </ScrollView>
          <View className='hot-detail-action-bar'>
            {collected && (
              <View className='hot-detail-fav-btn hot-detail-action-btn hot-detail-fav-btn--active' onClick={handleCancelCollect}>
                <Text className='hot-detail-fav-btn-text hot-detail-fav-btn-text--active'>{removing ? '取消中...' : '已收藏'}</Text>
              </View>
            )}
            {isVideoNote && (
              <View className='hot-detail-create-btn hot-detail-action-btn' onClick={() => setRemixDrawerVisible(true)}>
                <Text className='hot-detail-create-btn-text'>一键复刻</Text>
              </View>
            )}
            {!isVideoNote && !inlineTask && !taskCanRewrite && (
              <View className={`hot-detail-create-btn hot-detail-action-btn ${creating ? 'hot-detail-create-btn--disabled' : ''}`} onClick={handleParseCurrent}>
                <Text className='hot-detail-create-btn-text'>{creating ? '正在解析中' : '解析图文'}</Text>
              </View>
            )}
            {!isVideoNote && inlineTask && !taskCanRewrite && !hasRewriteResult && (
              <View className='hot-detail-create-btn hot-detail-action-btn hot-detail-create-btn--disabled'>
                <Text className='hot-detail-create-btn-text'>正在解析中</Text>
              </View>
            )}
            {!isVideoNote && (taskCanRewrite || hasRewriteResult) && (
              <View className={`hot-detail-create-btn hot-detail-action-btn ${rewriting ? 'hot-detail-create-btn--disabled' : ''}`} onClick={hasRewriteResult ? handleOpenRewriteDrawer : (rewriting ? undefined : handleRewrite)}>
                <Text className='hot-detail-create-btn-text'>{hasRewriteResult ? '查看仿写结果' : (rewriting ? '仿写中...' : '一键仿写')}</Text>
              </View>
            )}
          </View>
          {renderRewriteDrawer()}
          {renderRemixDrawer()}
        </>
      )}
    </View>
  );
}
