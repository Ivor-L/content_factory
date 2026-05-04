import { View, Text, ScrollView, Image, Video, Textarea } from '@tarojs/components';
import Taro, { useDidShow, useLoad, usePullDownRefresh } from '@tarojs/taro';
import { useEffect, useMemo, useRef, useState } from 'react';
import { miniappApi } from '../../utils/miniapp-api';
import type { StoryboardSegmentItem, StoryboardTaskStatusResult } from '../../utils/miniapp-api';
import { api } from '../../utils/api';
import imageIcon from '../../assets/icons/storyboard-placeholder-image.svg';
import videoIcon from '../../assets/icons/storyboard-placeholder-video.svg';
import './index.sass';

const POLL_INTERVAL = 4000;
const IMAGE_MODELS = [
  { id: 'nanoBananapro', label: 'Nano Banana Pro' },
  { id: 'nanoBanana2', label: 'Nano Banana 2' },
];
const VIDEO_MODELS = [
  { id: 'veo3.1-fast', label: 'Veo 3.1 Fast' },
  { id: 'veo_3_1-fast', label: 'Veo 3.1 Fast(兼容)' },
];
type StoryboardRef = { type: string; url: string; label?: string };

function decodeQueryText(value: string): string {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

export default function StoryboardBoardPage() {
  const [taskId, setTaskId] = useState('');
  const [title, setTitle] = useState('3D骨骼分镜板');
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState('');
  const [task, setTask] = useState<StoryboardTaskStatusResult | null>(null);
  const [imageModel, setImageModel] = useState('nanoBananapro');
  const [videoModel, setVideoModel] = useState('veo3.1-fast');
  const [editingSegmentId, setEditingSegmentId] = useState('');
  const [editingType, setEditingType] = useState<'image' | 'video'>('image');
  const [editingPrompt, setEditingPrompt] = useState('');
  const [editingImageModel, setEditingImageModel] = useState('nanoBananapro');
  const [editingVideoModel, setEditingVideoModel] = useState('veo3.1-fast');
  const [editingRefs, setEditingRefs] = useState<StoryboardRef[]>([]);
  const [uploadingRef, setUploadingRef] = useState(false);
  const [uploadingAsset, setUploadingAsset] = useState(false);
  const [editModelSheetOpen, setEditModelSheetOpen] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [actioningMap, setActioningMap] = useState<Record<string, boolean>>({});
  const [modelSheetOpen, setModelSheetOpen] = useState(false);
  const [imageErrorMap, setImageErrorMap] = useState<Record<string, boolean>>({});
  const [videoErrorMap, setVideoErrorMap] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState(false);
  const timerRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current != null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const shouldKeepPolling = useMemo(() => {
    const status = String(task?.status || '').toUpperCase();
    if (!status) return true;
    return !(status.includes('COMPLETE') || status.includes('FAIL') || status.includes('ERROR'));
  }, [task?.status]);

  const upsertLocalSegment = (segmentId: string, patch: Partial<StoryboardSegmentItem>) => {
    setTask((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        segments: prev.segments.map((item) => (item.id === segmentId ? { ...item, ...patch } : item)),
      };
    });
  };

  const loadStatus = async (silent = false) => {
    if (!taskId) return;
    if (!silent) setLoading(true);
    try {
      const data = await miniappApi.getStoryboardStatus(taskId);
      setTask(data);
      if (data.imageModel) setImageModel(data.imageModel);
      if (data.videoModel) setVideoModel(data.videoModel);
      setErrorText('');
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '分镜任务加载失败');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useLoad((query) => {
    const id = String(query?.id || '').trim();
    const incomingTitle = decodeQueryText(String(query?.title || ''));
    if (!id) {
      setErrorText('缺少任务ID');
      setLoading(false);
      return;
    }
    setTaskId(id);
    if (incomingTitle) setTitle(incomingTitle);
  });

  useDidShow(() => {
    if (!taskId) return;
    void loadStatus(false);
  });

  useEffect(() => {
    if (!taskId) return;

    clearTimer();
    timerRef.current = setInterval(() => {
      if (!shouldKeepPolling) return;
      void loadStatus(true);
    }, POLL_INTERVAL) as unknown as number;

    return () => {
      clearTimer();
    };
  }, [taskId, shouldKeepPolling]);

  usePullDownRefresh(() => {
    void (async () => {
      await loadStatus(false);
      Taro.stopPullDownRefresh();
    })();
  });

  useEffect(() => {
    const onKeyboard = (result: { height?: number }) => {
      const nextHeight = Math.max(0, Number(result?.height || 0));
      setKeyboardHeight(nextHeight);
    };
    Taro.onKeyboardHeightChange(onKeyboard);
    return () => {
      Taro.offKeyboardHeightChange(onKeyboard);
    };
  }, []);

  const handleBack = () => {
    const pages = Taro.getCurrentPages();
    if (pages.length > 1) {
      Taro.navigateBack({ delta: 1 });
      return;
    }
    Taro.switchTab({ url: '/pages/works/index' });
  };

  const setActioning = (key: string, value: boolean) => {
    setActioningMap((prev) => ({ ...prev, [key]: value }));
  };

  const isActioning = (key: string) => Boolean(actioningMap[key]);

  const setImageFailed = (segmentId: string, failed: boolean) => {
    setImageErrorMap((prev) => ({ ...prev, [segmentId]: failed }));
  };

  const setVideoFailed = (segmentId: string, failed: boolean) => {
    setVideoErrorMap((prev) => ({ ...prev, [segmentId]: failed }));
  };

  const buildTaskDefaultRefs = (): StoryboardRef[] => {
    const refs: StoryboardRef[] = [];
    for (const ref of task?.references || []) {
      if (ref.type !== 'product') continue;
      if (!ref.imageUrl) continue;
      refs.push({
        type: 'product',
        url: ref.imageUrl,
        label: '产品图',
      });
    }
    return refs;
  };

  const getSegmentParams = (segment: StoryboardSegmentItem): Record<string, unknown> => (
    segment.generationParams && typeof segment.generationParams === 'object' && !Array.isArray(segment.generationParams)
      ? segment.generationParams
      : {}
  );

  const getSegmentRefs = (segment: StoryboardSegmentItem, type: 'image' | 'video'): StoryboardRef[] => {
    const rawParams = getSegmentParams(segment);
    const key = type === 'image' ? 'subject_refs' : 'video_refs';
    const stored = Array.isArray(rawParams[key])
      ? (rawParams[key] as unknown[])
        .map((item) => {
          const obj = item && typeof item === 'object' ? item as Record<string, unknown> : {};
          return {
            type: String(obj.type || 'custom'),
            url: String(obj.url || '').trim(),
            label: typeof obj.label === 'string' ? obj.label : undefined,
          };
        })
        .filter((item) => item.url)
      : [];
    const defaults = buildTaskDefaultRefs();
    const refs = [...stored, ...defaults];
    if (type === 'video' && segment.generatedImage) {
      refs.unshift({ type: 'reference_frame', url: segment.generatedImage, label: '首帧图' });
    }
    const seen = new Set<string>();
    return refs.filter((ref) => {
      const url = normalizeMediaUrl(ref.url);
      if (!url || seen.has(url)) return false;
      seen.add(url);
      ref.url = url;
      return true;
    }).slice(0, 6);
  };

  const getSegmentAssets = (segment: StoryboardSegmentItem, type: 'image' | 'video'): string[] => {
    const current = normalizeMediaUrl(type === 'image' ? segment.generatedImage : segment.generatedVideo);
    const rawParams = getSegmentParams(segment);
    const historyKey = type === 'image' ? 'image_history' : 'video_history';
    const history = Array.isArray(rawParams[historyKey])
      ? (rawParams[historyKey] as unknown[])
        .map((item) => normalizeMediaUrl(typeof item === 'string' ? item : ''))
        .filter(Boolean)
      : [];
    return uniqueStrings([current, ...history]);
  };

  const handleOpenAsset = (type: 'image' | 'video', segment: StoryboardSegmentItem) => {
    const imageUrl = normalizeMediaUrl(segment.generatedImage);
    const videoUrl = normalizeMediaUrl(segment.generatedVideo);
    if (type === 'image') {
      if (!imageUrl) return;
      Taro.previewImage({ current: imageUrl, urls: [imageUrl] });
      return;
    }

    if (!videoUrl) return;
    Taro.navigateTo({
      url: `/subpages/work-detail/index?id=${encodeURIComponent(`${segment.id}:video`)}`,
      success: () => {
        Taro.setStorageSync('WORK_DETAIL_ITEM', {
          id: `${segment.id}:video`,
          title: `镜头 ${segment.order + 1} 视频预览`,
          type: 'video',
          status: segment.status,
          createdAt: new Date().toISOString(),
          preview: videoUrl,
          thumbnailUrl: imageUrl || null,
          metadata: null,
          source: 'task',
        });
      },
      fail: () => {
        Taro.showToast({ title: '暂不支持此方式预览视频', icon: 'none' });
      },
    });
  };

  const handleEditPrompt = (segment: StoryboardSegmentItem, type: 'image' | 'video') => {
    setEditingSegmentId(segment.id);
    setEditingType(type);
    setEditingPrompt(type === 'image' ? (segment.imagePrompt || '') : (segment.videoPrompt || ''));
    setEditingImageModel(imageModel);
    setEditingVideoModel(videoModel);
    setEditingRefs(getSegmentRefs(segment, type));
  };

  const closeEditPrompt = () => {
    setEditingSegmentId('');
    setEditingPrompt('');
    setEditingRefs([]);
    setEditModelSheetOpen(false);
    setKeyboardHeight(0);
  };

  const handleChooseRefImage = async () => {
    if (uploadingRef) return;
    try {
      const choose = await Taro.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album'] });
      const tempPath = choose?.tempFilePaths?.[0];
      if (!tempPath) return;

      setUploadingRef(true);
      const ext = (tempPath.split('.').pop() || 'jpg').toLowerCase();
      const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
      const uploaded = await api.uploadMedia(tempPath, `storyboard-ref-${Date.now()}.${ext}`, mime);
      setEditingRefs((prev) => [...prev, { type: 'custom', url: uploaded, label: '参考图' }].slice(0, 6));
      Taro.showToast({ title: '参考图已上传', icon: 'success' });
    } catch (error) {
      if (isUserCancel(error)) return;
      Taro.showToast({ title: error instanceof Error ? error.message : '上传失败', icon: 'none' });
    } finally {
      setUploadingRef(false);
    }
  };

  const handleSelectAsset = async (url: string) => {
    const segment = editingSegment;
    const assetUrl = normalizeMediaUrl(url);
    if (!segment || !assetUrl) return;
    const currentUrl = normalizeMediaUrl(editingType === 'image' ? segment.generatedImage : segment.generatedVideo);
    if (assetUrl === currentUrl) return;

    const patch = editingType === 'image'
      ? { generatedImage: assetUrl, push_image_url: true, status: 'IMAGE_READY' }
      : { generatedVideo: assetUrl, push_video_url: true, status: 'VIDEO_READY' };
    try {
      await miniappApi.updateStoryboardSegment(segment.id, patch);
      const params = getSegmentParams(segment);
      const historyKey = editingType === 'image' ? 'image_history' : 'video_history';
      const nextHistory = uniqueStrings([
        currentUrl,
        ...(Array.isArray(params[historyKey]) ? (params[historyKey] as unknown[]).map((item) => normalizeMediaUrl(typeof item === 'string' ? item : '')) : []),
      ]).slice(0, 20);
      upsertLocalSegment(segment.id, {
        ...(editingType === 'image'
          ? { generatedImage: assetUrl, status: 'IMAGE_READY' }
          : { generatedVideo: assetUrl, status: 'VIDEO_READY' }),
        generationParams: { ...params, [historyKey]: nextHistory },
      });
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '切换素材失败', icon: 'none' });
    }
  };

  const handleUploadAsset = async () => {
    const segment = editingSegment;
    if (!segment || uploadingAsset) return;
    try {
      let uploaded = '';
      setUploadingAsset(true);
      if (editingType === 'image') {
        const choose = await Taro.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album'] });
        const tempPath = choose?.tempFilePaths?.[0];
        if (!tempPath) return;
        const ext = (tempPath.split('.').pop() || 'jpg').toLowerCase();
        const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
        uploaded = await api.uploadMedia(tempPath, `storyboard-image-${Date.now()}.${ext}`, mime);
      } else {
        const choose = await Taro.chooseVideo({ sourceType: ['album'], compressed: true });
        const tempPath = choose?.tempFilePath;
        if (!tempPath) return;
        const ext = (tempPath.split('.').pop() || 'mp4').toLowerCase();
        const mimeByExt: Record<string, string> = {
          mp4: 'video/mp4',
          mov: 'video/quicktime',
          m4v: 'video/mp4',
          webm: 'video/webm',
        };
        uploaded = await api.uploadMedia(tempPath, `storyboard-video-${Date.now()}.${ext}`, mimeByExt[ext] || 'video/mp4');
      }

      if (uploaded) {
        await handleSelectAsset(uploaded);
        Taro.showToast({ title: '素材已添加', icon: 'success' });
      }
    } catch (error) {
      if (isUserCancel(error)) return;
      Taro.showToast({ title: error instanceof Error ? error.message : '上传失败', icon: 'none' });
    } finally {
      setUploadingAsset(false);
    }
  };

  const handleRemoveRef = (index: number) => {
    setEditingRefs((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSavePrompt = async (silent = false) => {
    const segmentId = editingSegmentId;
    if (!segmentId) return;
    const prompt = editingPrompt.trim();
    setSavingPrompt(true);
    try {
      await miniappApi.updateStoryboardSegment(segmentId, editingType === 'image'
        ? { imagePrompt: prompt, subject_refs: editingRefs }
        : { videoPrompt: prompt, video_refs: editingRefs });
      upsertLocalSegment(segmentId, editingType === 'image'
        ? { imagePrompt: prompt }
        : { videoPrompt: prompt });

      if (editingType === 'image') {
        setImageModel(editingImageModel);
      } else {
        setVideoModel(editingVideoModel);
      }

      if (!silent) {
        Taro.showToast({ title: '提示词已保存', icon: 'success' });
      }
      return true;
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '保存失败', icon: 'none' });
      return false;
    } finally {
      setSavingPrompt(false);
    }
  };

  const handleRegenerateImage = async (segment: StoryboardSegmentItem) => {
    const actionKey = `${segment.id}-regen-image`;
    if (isActioning(actionKey)) return;
    setActioning(actionKey, true);
    try {
      const result = await miniappApi.generateStoryboardImages({
        taskId,
        segmentIds: [segment.id],
        model: editingImageModel || imageModel,
        aspectRatio: '16:9',
      });
      if (result.triggered <= 0) {
        throw new Error(result.message || '触发生图失败');
      }
      upsertLocalSegment(segment.id, { status: 'IMAGE_GENERATING' });
      Taro.showToast({ title: '已重新触发生图', icon: 'success' });
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '触发生图失败', icon: 'none' });
    } finally {
      setActioning(actionKey, false);
    }
  };

  const handleRegenerateVideo = async (segment: StoryboardSegmentItem) => {
    const actionKey = `${segment.id}-regen-video`;
    if (isActioning(actionKey)) return;
    setActioning(actionKey, true);
    try {
      const result = await miniappApi.generateStoryboardVideos({
        taskId,
        segmentIds: [segment.id],
        model: editingVideoModel || videoModel,
        allowTextVideo: true,
      });
      if (result.triggered <= 0) {
        throw new Error(result.message || '触发生视频失败');
      }
      upsertLocalSegment(segment.id, { status: 'VIDEO_GENERATING' });
      Taro.showToast({ title: '已重新触发生视频', icon: 'success' });
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '触发生视频失败', icon: 'none' });
    } finally {
      setActioning(actionKey, false);
    }
  };

  const handleGenerateAllImages = async () => {
    const actionKey = 'batch-image';
    if (isActioning(actionKey)) return;
    if (!segments.length) {
      Taro.showToast({ title: '暂无可生图镜头', icon: 'none' });
      return;
    }

    let targetSegments = segments.filter((segment) => !normalizeMediaUrl(segment.generatedImage));
    if (targetSegments.length === 0) {
      const confirm = await Taro.showModal({
        title: '重新生成图片？',
        content: '所有镜头已有首帧图，将重新生成全部镜头图片。',
        confirmText: '重新生成',
        cancelText: '取消',
      });
      if (!confirm.confirm) return;
      targetSegments = segments;
    }

    setActioning(actionKey, true);
    try {
      const result = await miniappApi.generateStoryboardImages({
        taskId,
        segmentIds: targetSegments.map((segment) => segment.id),
        model: imageModel,
        aspectRatio: '16:9',
      });
      if (result.triggered <= 0) {
        throw new Error(result.message || '一键生图失败');
      }
      targetSegments.forEach((segment) => upsertLocalSegment(segment.id, { status: 'IMAGE_GENERATING' }));
      Taro.showToast({ title: `已触发生图${result.triggered}个`, icon: 'success' });
      await loadStatus(true);
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '一键生图失败', icon: 'none' });
    } finally {
      setActioning(actionKey, false);
    }
  };

  const handleGenerateAllVideos = async () => {
    const actionKey = 'batch-video';
    if (isActioning(actionKey)) return;
    if (!segments.length) {
      Taro.showToast({ title: '暂无可生成视频镜头', icon: 'none' });
      return;
    }

    let targetSegments = segments.filter((segment) => !normalizeMediaUrl(segment.generatedVideo));
    if (targetSegments.length === 0) {
      const confirm = await Taro.showModal({
        title: '重新生成视频？',
        content: '所有镜头已有视频，将重新生成全部镜头视频。',
        confirmText: '重新生成',
        cancelText: '取消',
      });
      if (!confirm.confirm) return;
      targetSegments = segments;
    }

    setActioning(actionKey, true);
    try {
      const result = await miniappApi.generateStoryboardVideos({
        taskId,
        segmentIds: targetSegments.map((segment) => segment.id),
        model: videoModel,
        allowTextVideo: true,
      });
      if (result.triggered <= 0) {
        throw new Error(result.message || '一键生成视频失败');
      }
      targetSegments.forEach((segment) => upsertLocalSegment(segment.id, { status: 'VIDEO_GENERATING' }));
      Taro.showToast({ title: `已触发视频${result.triggered}个`, icon: 'success' });
      await loadStatus(true);
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '一键生成视频失败', icon: 'none' });
    } finally {
      setActioning(actionKey, false);
    }
  };

  const handleOpenFinalVideo = () => {
    if (!task?.finalVideoUrl) {
      Taro.showToast({ title: '成片还未生成', icon: 'none' });
      return;
    }
    Taro.navigateTo({
      url: `/subpages/work-detail/index?id=${encodeURIComponent(`${task.id}:final-video`)}`,
      success: () => {
        Taro.setStorageSync('WORK_DETAIL_ITEM', {
          id: `${task.id}:final-video`,
          title: title || '分镜成片',
          type: 'video',
          status: task.status,
          createdAt: new Date().toISOString(),
          preview: task.finalVideoUrl,
          thumbnailUrl: null,
          metadata: null,
          source: 'task',
        });
      },
      fail: () => {
        Taro.showToast({ title: '暂不支持此方式预览成片', icon: 'none' });
      },
    });
  };

  const handleMerge = async () => {
    const actionKey = 'merge';
    if (isActioning(actionKey)) return;
    setActioning(actionKey, true);
    try {
      await miniappApi.mergeStoryboard(taskId);
      Taro.showToast({ title: '已触发一键剪辑', icon: 'success' });
      await loadStatus(true);
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '触发失败', icon: 'none' });
    } finally {
      setActioning(actionKey, false);
    }
  };

  const handleDeleteTask = async (mode: 'delete' | 'cancel' = 'delete') => {
    if (!taskId || deleting) return;
    const modal = await Taro.showModal({
      title: mode === 'cancel' ? '取消生成' : '删除分镜板',
      content: mode === 'cancel'
        ? '取消后会直接删除这个分镜任务，确认取消生成吗？'
        : '删除后不可恢复，确认删除这个分镜板吗？',
      confirmText: mode === 'cancel' ? '取消生成' : '删除',
      confirmColor: '#ff5a5f',
      cancelText: '取消',
    });
    if (!modal.confirm) return;

    setDeleting(true);
    clearTimer();
    try {
      await miniappApi.deleteStoryboardTask(taskId);
      Taro.showToast({ title: mode === 'cancel' ? '已取消' : '已删除', icon: 'success' });
      setTimeout(() => {
        const pages = Taro.getCurrentPages();
        if (pages.length > 1) {
          Taro.navigateBack({ delta: 1 });
        } else {
          Taro.switchTab({ url: '/pages/works/index' });
        }
      }, 360);
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '删除失败', icon: 'none' });
    } finally {
      setDeleting(false);
    }
  };

  const segments = task?.segments || [];
  const references = (task?.references || []).filter((ref) => ref.type === 'product');
  const taskMetadata = getTaskMetadata(task);
  const workflowData = getWorkflowData(task);
  const storyboardGridUrl = getStoryboardGridUrl(task);
  const contentStructure = getContentStructure(workflowData);
  const cloneClips = getCloneClips(workflowData);
  const isViralRemix = taskMetadata.feature === 'viral_remix';
  const remixStageItems = isViralRemix ? buildRemixStages(task, segments, taskMetadata) : [];
  const isPreparingStoryboard = !errorText && segments.length === 0;
  const canShowActionBar = !loading && !errorText && segments.length > 0;

  const editingSegment = useMemo(
    () => segments.find((item) => item.id === editingSegmentId) || null,
    [segments, editingSegmentId],
  );
  const editingAssets = editingSegment ? getSegmentAssets(editingSegment, editingType) : [];
  const composerStyle = useMemo(
    () => (keyboardHeight > 0 ? { transform: `translateY(-${keyboardHeight}px)` } : undefined),
    [keyboardHeight],
  );

  return (
    <View className='storyboard-board-page'>
      <View className='storyboard-board-nav'>
        <View className='storyboard-board-back' onClick={handleBack}>
          <Text className='storyboard-board-back-text'>‹</Text>
        </View>
        <Text className='storyboard-board-nav-title'>{isViralRemix ? '爆款复刻' : '分镜板'}</Text>
        <View className='storyboard-board-nav-spacer' />
      </View>

      <ScrollView scrollY className='storyboard-board-scroll'>
        <View className='storyboard-board-header'>
          <Text className='storyboard-board-title'>{isViralRemix ? '一键复刻' : (title || '分镜任务')}</Text>
        </View>

        {!loading && !errorText && isViralRemix && (
          <View className='remix-stage-section'>
            <View className='remix-stage-track'>
              {remixStageItems.map((stage, index) => (
                <View key={stage.key} className='remix-stage-item'>
                  <View className={`remix-stage-dot remix-stage-dot--${stage.state}`}>
                    <Text className='remix-stage-dot-text'>{index + 1}</Text>
                  </View>
                  {index < remixStageItems.length - 1 && <View className={`remix-stage-line remix-stage-line--${stage.state}`} />}
                  <Text className={`remix-stage-name remix-stage-name--${stage.state}`}>{stage.title}</Text>
                  <Text className='remix-stage-desc'>{stage.desc}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {!loading && !errorText && isViralRemix && storyboardGridUrl && (
          <View className='storyboard-grid-section'>
            <Text className='storyboard-section-title'>分镜网格图</Text>
            <Image
              className='storyboard-grid-image'
              src={storyboardGridUrl}
              mode='widthFix'
              onClick={() => Taro.previewImage({ current: storyboardGridUrl, urls: [storyboardGridUrl] })}
            />
          </View>
        )}

        {!loading && !errorText && isViralRemix && contentStructure.length > 0 && (
          <View className='storyboard-structure-section'>
            <Text className='storyboard-section-title'>中文内容结构</Text>
            {contentStructure.map((item) => (
              <View key={item.key} className='storyboard-structure-item'>
                <Text className='storyboard-structure-title'>{item.label}{item.timeRange ? ` · ${item.timeRange}` : ''}</Text>
                <Text className='storyboard-structure-text'>{item.summary}</Text>
                {!!item.mechanism && <Text className='storyboard-structure-note'>{item.mechanism}</Text>}
              </View>
            ))}
          </View>
        )}

        {!loading && !errorText && isViralRemix && cloneClips.length > 0 && (
          <View className='storyboard-clone-section'>
            <Text className='storyboard-section-title'>可重复生成脚本</Text>
            {cloneClips.map((clip, index) => (
              <View key={`${clip.clipIndex}-${index}`} className='storyboard-clone-item'>
                <Text className='storyboard-clone-title'>Clip {clip.clipIndex} · {clip.duration}s {clip.timeRange ? `· ${clip.timeRange}` : ''}</Text>
                <Text className='storyboard-clone-prompt'>{clip.prompt}</Text>
              </View>
            ))}
          </View>
        )}

        {!loading && !errorText && references.length > 0 && (
          <View className='storyboard-reference-section'>
            <Text className='storyboard-reference-title'>主体参考</Text>
            <View className='storyboard-reference-list'>
              {references.map((ref) => (
                <View key={`${ref.type}-${ref.id}`} className='storyboard-reference-card'>
                  <View className='storyboard-reference-image-wrap'>
                    {ref.imageUrl ? (
                      <Image className='storyboard-reference-image' src={ref.imageUrl} mode='aspectFill' />
                    ) : (
                      <Text className='storyboard-reference-placeholder'>产品</Text>
                    )}
                  </View>
                  <View className='storyboard-reference-info'>
                    <Text className='storyboard-reference-label'>参考产品</Text>
                    <Text className='storyboard-reference-name'>{ref.name}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {(loading || isPreparingStoryboard) && (
            <View className='storyboard-board-pending'>
              <View className='storyboard-board-spinner'>
                <View className='storyboard-board-spinner-core' />
              </View>
            <Text className='storyboard-board-pending-title'>{isViralRemix ? getPendingTitle(taskMetadata) : '正在生成分镜'}</Text>
            <Text className='storyboard-board-pending-text'>任务已在后端运行，退出页面后也会继续处理</Text>
            <View className='storyboard-board-cancel-btn' onClick={() => void handleDeleteTask('cancel')}>
              <Text className='storyboard-board-cancel-text'>{deleting ? '取消中...' : '取消生成'}</Text>
            </View>
          </View>
        )}

        {!loading && !!errorText && (
          <View className='storyboard-board-state'>
            <Text className='storyboard-board-state-text'>{errorText}</Text>
          </View>
        )}

        {!loading && !errorText && segments.length > 0 && (
          <View className='storyboard-board-list'>
            {segments.map((segment) => (
              <View key={segment.id} className='storyboard-segment-card'>
                {(() => {
                  const imageUrl = normalizeMediaUrl(segment.generatedImage);
                  const videoUrl = normalizeMediaUrl(segment.generatedVideo);
                  const showImage = Boolean(imageUrl) && !Boolean(imageErrorMap[segment.id]);
                  const showVideo = Boolean(videoUrl) && !Boolean(videoErrorMap[segment.id]);
                  return (
                    <>
                <View className='storyboard-segment-head'>
                  <Text className='storyboard-segment-order'>镜头 {segment.order + 1}</Text>
                  <Text className='storyboard-segment-status'>{toStatusText(segment.status || '')}</Text>
                </View>
                <Text className='storyboard-segment-meta'>时长：{segment.duration || 0}s {segment.timeRange ? `| ${segment.timeRange}` : ''}</Text>
                {!!normalizeText(segment.originalScript) && (
                  <Text className='storyboard-segment-text'>脚本：{normalizeText(segment.originalScript)}</Text>
                )}
                {!!normalizeText(segment.imagePrompt) && (
                  <Text className='storyboard-segment-text'>首帧提示词：{normalizeText(segment.imagePrompt)}</Text>
                )}
                {!!normalizeText(segment.videoPrompt) && (
                  <Text className='storyboard-segment-text'>视频提示词：{normalizeText(segment.videoPrompt)}</Text>
                )}

                <View className='storyboard-asset-grid'>
                  <View className='storyboard-asset-block'>
                    {isViralRemix && <Text className='storyboard-asset-title'>产品/角色替换图</Text>}
                    <View className='storyboard-asset-stage' onClick={() => handleEditPrompt(segment, 'image')}>
                      {showImage ? (
                        <Image
                          className='storyboard-asset-image'
                          src={imageUrl as string}
                          mode='aspectFit'
                          onLoad={() => setImageFailed(segment.id, false)}
                          onError={() => setImageFailed(segment.id, true)}
                        />
                      ) : (
                        <Image className='storyboard-asset-placeholder-icon storyboard-asset-placeholder-icon--image' src={imageIcon} mode='aspectFit' />
                      )}
                    </View>
                  </View>

                  <View className='storyboard-asset-block'>
                    {isViralRemix && <Text className='storyboard-asset-title'>视频生成</Text>}
                    <View className='storyboard-asset-stage' onClick={() => handleEditPrompt(segment, 'video')}>
                      {showVideo ? (
                        <Video
                          className='storyboard-asset-video'
                          src={videoUrl as string}
                          poster={imageUrl || ''}
                          controls
                          onLoadedMetadata={() => setVideoFailed(segment.id, false)}
                          onError={() => setVideoFailed(segment.id, true)}
                        />
                      ) : (
                        <Image className='storyboard-asset-placeholder-icon storyboard-asset-placeholder-icon--video' src={videoIcon} mode='aspectFit' />
                      )}
                    </View>
                  </View>
                </View>
                    </>
                  );
                })()}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {canShowActionBar && (
      <View className='storyboard-action-bar'>
        <View className='storyboard-action-row storyboard-action-row--primary'>
          <View className='storyboard-action-btn storyboard-bottom-btn storyboard-bottom-btn--ghost' onClick={() => void handleGenerateAllImages()}>
            <Text className='storyboard-bottom-btn-text storyboard-bottom-btn-text--ghost'>
              {isActioning('batch-image') ? '生图中...' : '一键生图'}
            </Text>
          </View>
          <View className='storyboard-action-btn storyboard-bottom-btn storyboard-bottom-btn--primary' onClick={() => void handleGenerateAllVideos()}>
            <Text className='storyboard-bottom-btn-text'>
              {isActioning('batch-video') ? '生成中...' : '一键生成视频'}
            </Text>
          </View>
        </View>
        <View className='storyboard-action-row'>
          <View className='storyboard-setting-btn' onClick={() => setModelSheetOpen(true)}>
            <Text className='storyboard-setting-icon'>⚙</Text>
          </View>
          <View className='storyboard-action-btn storyboard-bottom-btn storyboard-bottom-btn--ghost' onClick={handleOpenFinalVideo}>
            <Text className='storyboard-bottom-btn-text storyboard-bottom-btn-text--ghost'>查看成片</Text>
          </View>
          <View className='storyboard-action-btn storyboard-bottom-btn storyboard-bottom-btn--primary' onClick={handleMerge}>
            <Text className='storyboard-bottom-btn-text'>
              {isActioning('merge') ? '剪辑中...' : '一键剪辑'}
            </Text>
          </View>
        </View>
      </View>
      )}

      {modelSheetOpen && (
        <View className='storyboard-sheet-mask' onClick={() => setModelSheetOpen(false)}>
          <View className='storyboard-sheet-panel' onClick={(e) => e.stopPropagation()}>
            <Text className='storyboard-sheet-title'>模型设置</Text>
            <Text className='storyboard-sheet-label'>图片模型</Text>
            <View className='storyboard-sheet-tabs'>
              {IMAGE_MODELS.map((model) => (
                <View
                  key={model.id}
                  className={`storyboard-sheet-tab ${imageModel === model.id ? 'storyboard-sheet-tab--active' : ''}`}
                  onClick={() => setImageModel(model.id)}
                >
                  <Text className={`storyboard-sheet-tab-text ${imageModel === model.id ? 'storyboard-sheet-tab-text--active' : ''}`}>
                    {model.label}
                  </Text>
                </View>
              ))}
            </View>

            <Text className='storyboard-sheet-label'>视频模型</Text>
            <View className='storyboard-sheet-tabs'>
              {VIDEO_MODELS.map((model) => (
                <View
                  key={model.id}
                  className={`storyboard-sheet-tab ${videoModel === model.id ? 'storyboard-sheet-tab--active' : ''}`}
                  onClick={() => setVideoModel(model.id)}
                >
                  <Text className={`storyboard-sheet-tab-text ${videoModel === model.id ? 'storyboard-sheet-tab-text--active' : ''}`}>
                    {model.label}
                  </Text>
                </View>
              ))}
            </View>

            <View className='storyboard-sheet-confirm' onClick={() => setModelSheetOpen(false)}>
              <Text className='storyboard-sheet-confirm-text'>完成</Text>
            </View>
            <View
              className='storyboard-sheet-danger'
              onClick={() => {
                setModelSheetOpen(false);
                void handleDeleteTask('delete');
              }}
            >
              <Text className='storyboard-sheet-danger-text'>{deleting ? '删除中...' : '删除分镜板'}</Text>
            </View>
          </View>
        </View>
      )}

      {editingSegment && (
        <View className='storyboard-edit-mask' onClick={closeEditPrompt}>
          <View className='storyboard-edit-panel' onClick={(e) => e.stopPropagation()}>
            <Text className='storyboard-edit-title'>镜头 {editingSegment.order + 1} · {editingType === 'image' ? '图片' : '视频'}</Text>
            <ScrollView scrollY className='storyboard-edit-content'>
              <View className='storyboard-edit-scroll-inner'>
                <View className='storyboard-edit-preview-stage'>
                  {editingType === 'image' ? (
                    normalizeMediaUrl(editingSegment.generatedImage) ? (
                      <Image className='storyboard-edit-preview-image' src={normalizeMediaUrl(editingSegment.generatedImage)} mode='aspectFit' />
                    ) : (
                      <Image className='storyboard-edit-preview-icon' src={imageIcon} mode='aspectFit' />
                    )
                  ) : (
                    normalizeMediaUrl(editingSegment.generatedVideo) ? (
                      <Video
                        className='storyboard-edit-preview-video'
                        src={normalizeMediaUrl(editingSegment.generatedVideo)}
                        poster={normalizeMediaUrl(editingSegment.generatedImage)}
                        controls
                      />
                    ) : (
                      <Image className='storyboard-edit-preview-icon' src={videoIcon} mode='aspectFit' />
                    )
                  )}
                  {(editingType === 'image'
                    ? normalizeMediaUrl(editingSegment.generatedImage)
                    : normalizeMediaUrl(editingSegment.generatedVideo)) && (
                    <View className='storyboard-edit-detail-btn' onClick={() => handleOpenAsset(editingType, editingSegment)}>
                      <Text className='storyboard-edit-detail-text'>详情</Text>
                    </View>
                  )}
                </View>

                <View className='storyboard-edit-assets-section'>
                  <View className='storyboard-edit-assets-head'>
                    <Text className='storyboard-edit-assets-title'>素材</Text>
                    <Text className='storyboard-edit-assets-tip'>选中的素材会作为当前片段展示</Text>
                  </View>
                  <ScrollView scrollX className='storyboard-edit-assets-scroll'>
                    <View className='storyboard-edit-assets-row'>
                      <View className='storyboard-edit-asset-add' onClick={() => void handleUploadAsset()}>
                        <Text className='storyboard-edit-asset-add-text'>{uploadingAsset ? '...' : '+'}</Text>
                      </View>
                      {editingAssets.map((assetUrl) => {
                        const activeUrl = normalizeMediaUrl(editingType === 'image' ? editingSegment.generatedImage : editingSegment.generatedVideo);
                        const active = assetUrl === activeUrl;
                        return (
                          <View
                            key={assetUrl}
                            className={`storyboard-edit-asset-item ${active ? 'storyboard-edit-asset-item--active' : ''}`}
                            onClick={() => void handleSelectAsset(assetUrl)}
                          >
                            {editingType === 'image' ? (
                              <Image className='storyboard-edit-asset-thumb' src={assetUrl} mode='aspectFill' />
                            ) : (
                              <>
                                {normalizeMediaUrl(editingSegment.generatedImage) ? (
                                  <Image className='storyboard-edit-asset-thumb' src={normalizeMediaUrl(editingSegment.generatedImage)} mode='aspectFill' />
                                ) : (
                                  <Image className='storyboard-edit-asset-video-icon' src={videoIcon} mode='aspectFit' />
                                )}
                                <View className='storyboard-edit-asset-video-badge'>
                                  <Text className='storyboard-edit-asset-video-badge-text'>视频</Text>
                                </View>
                              </>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>
                <View className='storyboard-edit-composer-space' />
              </View>
            </ScrollView>

            <View className='storyboard-edit-composer' style={composerStyle}>
              <View className='storyboard-edit-input-card'>
                <View className='storyboard-edit-ref-row storyboard-edit-ref-row--top'>
                  <View className='storyboard-edit-ref-add' onClick={handleChooseRefImage}>
                    <Text className='storyboard-edit-ref-add-text'>{uploadingRef ? '...' : '+'}</Text>
                  </View>
                  {editingRefs.map((ref, idx) => (
                    <View key={`${ref.url}-${idx}`} className='storyboard-edit-ref-item'>
                      <Image className='storyboard-edit-ref-image' src={ref.url} mode='aspectFill' />
                      <View className='storyboard-edit-ref-remove' onClick={() => handleRemoveRef(idx)}>
                        <Text className='storyboard-edit-ref-remove-text'>×</Text>
                      </View>
                    </View>
                  ))}
                </View>

                <Textarea
                  className='storyboard-edit-textarea'
                  value={editingPrompt}
                  onInput={(e) => setEditingPrompt(e.detail.value)}
                  maxlength={3000}
                  placeholder='请输入提示词'
                  fixed
                  adjustPosition={false}
                  cursorSpacing={20}
                />

                <View className='storyboard-edit-tool-row'>
                  <View className='storyboard-edit-model-mini' onClick={() => setEditModelSheetOpen(true)}>
                    <Text className='storyboard-edit-model-mini-value'>
                      {editingType === 'image'
                        ? getModelLabel(IMAGE_MODELS, editingImageModel)
                        : getModelLabel(VIDEO_MODELS, editingVideoModel)}
                    </Text>
                    <Text className='storyboard-edit-model-mini-arrow'>▾</Text>
                  </View>
                  <View
                    className='storyboard-edit-submit-circle'
                    onClick={() => {
                      void handleSavePrompt(true).then((ok) => {
                        if (!ok || !editingSegment) return;
                        if (editingType === 'image') void handleRegenerateImage(editingSegment);
                        else void handleRegenerateVideo(editingSegment);
                      });
                    }}
                  >
                    {(savingPrompt || isActioning(`${editingSegment.id}-${editingType === 'image' ? 'regen-image' : 'regen-video'}`)) ? (
                      <Text className='storyboard-edit-submit-loading'>...</Text>
                    ) : (
                      <Text className='storyboard-edit-submit-arrow'>↑</Text>
                    )}
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>
      )}

      {editingSegment && editModelSheetOpen && (
        <View className='storyboard-edit-model-sheet-mask' onClick={() => setEditModelSheetOpen(false)}>
          <View className='storyboard-edit-model-sheet' onClick={(e) => e.stopPropagation()}>
            <Text className='storyboard-edit-model-sheet-title'>选择模型</Text>
            <View className='storyboard-edit-model-sheet-list'>
              {(editingType === 'image' ? IMAGE_MODELS : VIDEO_MODELS).map((model) => {
                const active = editingType === 'image'
                  ? editingImageModel === model.id
                  : editingVideoModel === model.id;
                return (
                  <View
                    key={model.id}
                    className={`storyboard-edit-model-sheet-item ${active ? 'storyboard-edit-model-sheet-item--active' : ''}`}
                    onClick={() => {
                      if (editingType === 'image') setEditingImageModel(model.id);
                      else setEditingVideoModel(model.id);
                      setEditModelSheetOpen(false);
                    }}
                  >
                    <Text className={`storyboard-edit-model-sheet-item-text ${active ? 'storyboard-edit-model-sheet-item-text--active' : ''}`}>
                      {model.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

function normalizeText(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toStatusText(status: string): string {
  const s = String(status || '').toUpperCase();
  if (!s) return '--';
  if (s.includes('COMPLETE') || s === 'DONE' || s === 'SUCCESS' || s.includes('READY')) return '已完成';
  if (s.includes('GENERAT') || s.includes('PROCESS') || s.includes('ANALYZ') || s.includes('RUN') || s.includes('MERG')) return '处理中';
  if (s.includes('FAIL') || s.includes('ERROR')) return '失败';
  if (s.includes('PEND') || s.includes('QUEUE') || s.includes('WAIT')) return '待处理';
  return status;
}

function normalizeMediaUrl(value: string | null | undefined): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';
  if (raw.startsWith('//')) return `https:${raw}`;
  return raw;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeMediaUrl(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function getTaskMetadata(task: StoryboardTaskStatusResult | null): Record<string, unknown> {
  const detailed = task?.detailedBreakdown && typeof task.detailedBreakdown === 'object'
    ? task.detailedBreakdown
    : null;
  const metadata = detailed?.metadata && typeof detailed.metadata === 'object' && !Array.isArray(detailed.metadata)
    ? detailed.metadata as Record<string, unknown>
    : {};
  return metadata;
}

function getWorkflowData(task: StoryboardTaskStatusResult | null): Record<string, unknown> {
  const detailed = asRecord(task?.detailedBreakdown);
  const nested = asRecord(detailed?.workflow_data) || asRecord(detailed?.workflowData);
  return nested || detailed || {};
}

function getStoryboardGridUrl(task: StoryboardTaskStatusResult | null): string {
  const detailed = asRecord(task?.detailedBreakdown);
  const workflowData = getWorkflowData(task);
  return normalizeMediaUrl(
    String(
      detailed?.storyboard_grid_url ||
        detailed?.storyboardGridUrl ||
        workflowData.storyboard_grid_url ||
        workflowData.storyboardGridUrl ||
        '',
    ),
  );
}

function readStructureItem(value: unknown): { timeRange: string; summary: string; mechanism: string } | null {
  if (typeof value === 'string' && value.trim()) {
    return { timeRange: '', summary: value.trim(), mechanism: '' };
  }
  const record = asRecord(value);
  if (!record) return null;
  const summary = normalizeText(String(record.summary || record.description || record.text || ''));
  const mechanism = normalizeText(String(record.mechanism || record.replication_note || record.note || ''));
  const timeRange = normalizeText(String(record.time_range || record.timeRange || ''));
  if (!summary && !mechanism) return null;
  return { timeRange, summary: summary || mechanism, mechanism };
}

function getContentStructure(workflowData: Record<string, unknown>): Array<{
  key: string;
  label: string;
  timeRange: string;
  summary: string;
  mechanism: string;
}> {
  const structure = asRecord(workflowData.content_structure) || asRecord(workflowData.contentStructure);
  if (!structure) return [];
  const entries = [
    ['hook', '开头钩子'],
    ['buildup', '中间铺垫'],
    ['climax', '高潮'],
    ['cta', '结尾CTA'],
  ] as const;
  return entries
    .map(([key, label]) => {
      const item = readStructureItem(structure[key]);
      return item ? { key, label, ...item } : null;
    })
    .filter((item): item is {
      key: string;
      label: string;
      timeRange: string;
      summary: string;
      mechanism: string;
    } => Boolean(item));
}

function getCloneClips(workflowData: Record<string, unknown>): Array<{
  clipIndex: number;
  timeRange: string;
  duration: number;
  prompt: string;
}> {
  const clonePrompt = asRecord(workflowData.clone_prompt) || asRecord(workflowData.clonePrompt);
  const clips = Array.isArray(clonePrompt?.clips) ? clonePrompt.clips : [];
  return clips
    .map((item, index) => {
      const record = asRecord(item);
      if (!record) return null;
      const prompt = normalizeText(String(record.prompt || ''));
      if (!prompt) return null;
      return {
        clipIndex: Number(record.clip_index || record.clipIndex || index + 1) || index + 1,
        timeRange: normalizeText(String(record.time_range || record.timeRange || '')),
        duration: Number(record.duration || 0) || 0,
        prompt,
      };
    })
    .filter((item): item is {
      clipIndex: number;
      timeRange: string;
      duration: number;
      prompt: string;
    } => Boolean(item));
}

function buildRemixStages(
  task: StoryboardTaskStatusResult | null,
  segments: StoryboardSegmentItem[],
  metadata: Record<string, unknown>,
): Array<{ key: string; title: string; desc: string; state: 'done' | 'active' | 'todo' }> {
  const hasSegments = segments.length > 0;
  const hasImages = segments.some((segment) => Boolean(normalizeMediaUrl(segment.generatedImage)));
  const hasVideos = segments.some((segment) => Boolean(normalizeMediaUrl(segment.generatedVideo)));
  const hasFinalVideo = Boolean(normalizeMediaUrl(task?.finalVideoUrl || ''));
  const isStoryboardControl = metadata.strategy === 'STORYBOARD';

  return [
    {
      key: 'breakdown',
      title: isStoryboardControl ? '分镜板生成' : '爆款拆解',
      desc: hasSegments
        ? '已得到分镜提示词和分镜板'
        : isStoryboardControl
          ? '正在进入分镜板链路'
          : '正在对接 n8n 拆解参考视频',
      state: hasSegments ? 'done' : 'active',
    },
    {
      key: 'replace',
      title: '产品/角色替换',
      desc: hasImages ? '可查看、修改或重新生成分镜图' : hasSegments ? '等待生成替换后的分镜图' : '等待爆款拆解完成',
      state: hasImages ? 'done' : hasSegments ? 'active' : 'todo',
    },
    {
      key: 'video',
      title: '视频生成',
      desc: hasFinalVideo ? '成片已生成' : hasVideos ? '分镜视频已生成，可一键剪辑' : hasImages ? '可基于提示词和分镜图生成视频' : '等待分镜图完成',
      state: hasFinalVideo || hasVideos ? 'done' : hasImages ? 'active' : 'todo',
    },
  ];
}

function getPendingTitle(metadata: Record<string, unknown>): string {
  return metadata.strategy === 'STORYBOARD' ? '正在生成分镜板' : '正在进行爆款拆解';
}

function isUserCancel(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && 'errMsg' in error
      ? String((error as { errMsg?: unknown }).errMsg || '')
      : String(error || '');
  return /cancel|取消/i.test(message);
}

function getModelLabel(
  list: Array<{ id: string; label: string }>,
  id: string,
): string {
  const found = list.find((item) => item.id === id);
  return found?.label || id || '默认模型';
}
