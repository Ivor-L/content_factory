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
  { id: 'image2', label: 'GPT-image2' },
  { id: 'nanoBananapro', label: 'Nano Banana Pro' },
  { id: 'nanoBanana2', label: 'Nano Banana 2' },
];
const VIDEO_MODELS = [
  { id: 'bytedance/seedance-2', label: 'Seedance 2.0' },
  { id: 'bytedance/seedance-2-fast', label: 'Seedance 2.0 Fast' },
  { id: 'veo3.1-fast', label: 'Veo 3.1 Fast' },
  { id: 'veo_3_1-fast', label: 'Veo 3.1 Fast(兼容)' },
];
type StoryboardRef = { type: string; url: string; label?: string };
type RemixStageKey = 'breakdown' | 'replace' | 'video';
type RemixReplaceMode = '' | 'product' | 'character';

const DEFAULT_IMAGE_MODEL = 'image2';
const PRODUCT_REPLACE_PROMPT = '请将分镜故事板的产品换成图1';
const CHARACTER_REPLACE_PROMPT = '请替换分镜故事板中的角色';

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
  const [routeMode, setRouteMode] = useState('');
  const [selectedRemixStage, setSelectedRemixStage] = useState<RemixStageKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState('');
  const [task, setTask] = useState<StoryboardTaskStatusResult | null>(null);
  const [imageModel, setImageModel] = useState(DEFAULT_IMAGE_MODEL);
  const [videoModel, setVideoModel] = useState('veo3.1-fast');
  const [editingSegmentId, setEditingSegmentId] = useState('');
  const [editingType, setEditingType] = useState<'image' | 'video'>('image');
  const [editingPrompt, setEditingPrompt] = useState('');
  const [editingImageModel, setEditingImageModel] = useState(DEFAULT_IMAGE_MODEL);
  const [editingVideoModel, setEditingVideoModel] = useState('veo3.1-fast');
  const [editingRefs, setEditingRefs] = useState<StoryboardRef[]>([]);
  const [editingReplaceMode, setEditingReplaceMode] = useState<RemixReplaceMode>('');
  const [uploadingRef, setUploadingRef] = useState(false);
  const [uploadingAsset, setUploadingAsset] = useState(false);
  const [editModelSheetOpen, setEditModelSheetOpen] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [actioningMap, setActioningMap] = useState<Record<string, boolean>>({});
  const [modelSheetOpen, setModelSheetOpen] = useState(false);
  const [autoOpenEdit, setAutoOpenEdit] = useState(false);
  const [autoOpenedEdit, setAutoOpenedEdit] = useState(false);
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
    const incomingMode = String(query?.mode || '').trim().toLowerCase();
    const openEdit = String(query?.openEdit || '').trim().toLowerCase();
    setRouteMode(incomingMode);
    setSelectedRemixStage(null);
    setAutoOpenEdit(openEdit === 'image' || openEdit === 'replace');
    setAutoOpenedEdit(false);
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
      if (!ref.imageUrl) continue;
      refs.push({
        type: ref.type,
        url: ref.imageUrl,
        label: ref.type === 'character' ? '角色图' : '产品图',
      });
    }
    return refs;
  };

  const getRefsByKind = (kind: RemixReplaceMode): StoryboardRef[] => {
    const refs: StoryboardRef[] = [];
    for (const ref of task?.references || []) {
      if (!ref.imageUrl) continue;
      if (kind === 'product' && ref.type !== 'product') continue;
      if (kind === 'character' && ref.type !== 'character') continue;
      refs.push({
        type: ref.type,
        url: ref.imageUrl,
        label: ref.type === 'character' ? '角色图' : '产品图',
      });
    }
    return refs;
  };

  const buildReplaceRefs = (mode: RemixReplaceMode, segment: StoryboardSegmentItem): StoryboardRef[] => {
    const currentRefs = getSegmentRefs(segment, 'image');
    const targetRefs = mode === 'product' || mode === 'character' ? getRefsByKind(mode) : [];
    const otherRefs = currentRefs.filter((ref) => ref.type !== 'product' && ref.type !== 'character');
    const storyboardBoardUrl = getStoryboardGridBoards(task)[0]?.url || '';
    const storyboardBoardRef = storyboardBoardUrl
      ? [{ type: 'storyboard_board', url: storyboardBoardUrl, label: '分镜板图' }]
      : [];
    const refs = targetRefs.length > 0
      ? [...targetRefs, ...storyboardBoardRef, ...otherRefs]
      : [...currentRefs, ...storyboardBoardRef];
    const seen = new Set<string>();
    return refs.filter((ref) => {
      const url = normalizeMediaUrl(ref.url);
      if (!url || seen.has(url)) return false;
      seen.add(url);
      ref.url = url;
      return true;
    }).slice(0, 6);
  };

  const applyReplaceMode = (mode: RemixReplaceMode, segment: StoryboardSegmentItem | null = editingSegment) => {
    if (!segment || !mode) return;
    setEditingReplaceMode(mode);
    setEditingType('image');
    setEditingPrompt(mode === 'product' ? PRODUCT_REPLACE_PROMPT : CHARACTER_REPLACE_PROMPT);
    setEditingRefs(buildReplaceRefs(mode, segment));
    setEditingImageModel(DEFAULT_IMAGE_MODEL);
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
          title: `镜头 ${getSegmentDisplayOrder(segment, segments.findIndex((item) => item.id === segment.id))} 视频预览`,
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

  const handleEditReplace = (segment: StoryboardSegmentItem, mode: RemixReplaceMode = 'product') => {
    setEditingSegmentId(segment.id);
    setEditingVideoModel(videoModel);
    applyReplaceMode(mode, segment);
  };

  const closeEditPrompt = () => {
    setEditingSegmentId('');
    setEditingPrompt('');
    setEditingRefs([]);
    setEditingReplaceMode('');
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
        ? {
          imagePrompt: prompt,
          subject_refs: editingRefs,
          ...(editingReplaceMode ? { subject_replace_mode: editingReplaceMode } : {}),
        }
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
  const references = task?.references || [];
  const taskMetadata = getTaskMetadata(task);
  const workflowData = getWorkflowData(task);
  const storyboardGridBoards = getStoryboardGridBoards(task);
  const storyboardGridUrl = storyboardGridBoards[0]?.url || '';
  const contentStructure = getContentStructure(workflowData);
  const scriptSummary = getScriptSummary(workflowData, segments);
  const clonePromptSummary = getClonePromptSummary(workflowData, segments);
  const sourceAnalysisItems = getSourceAnalysisItems(workflowData);
  const beatMapItems = getBeatMapItems(workflowData);
  const mechanismSections = getMechanismSections(workflowData);
  const sceneDetailItems = getSceneDetailItems(workflowData, segments);
  const isViralRemix = taskMetadata.feature === 'viral_remix';
  const isRemixRoute = isViralRemix || routeMode.includes('remix');
  const isRemixReviewMode = isRemixRoute && !routeMode.includes('board');
  const remixOriginalVideoUrl = getRemixReferenceVideoUrl(taskMetadata, task);
  const remixOriginalPosterUrl = normalizeMediaUrl(String(
    taskMetadata.referencePoster ||
      taskMetadata.reference_video_poster ||
      storyboardGridUrl ||
      task?.coverImage ||
      '',
  ));
  const remixStageItems = isRemixRoute ? buildRemixStages(task, segments, taskMetadata) : [];
  const defaultRemixStage = remixStageItems.find((stage) => stage.state === 'active')?.key ||
    [...remixStageItems].reverse().find((stage) => stage.state === 'done')?.key ||
    'breakdown';
  const activeRemixStage = isRemixRoute ? (selectedRemixStage || defaultRemixStage) : null;
  const hasRemixBreakdownResult = isRemixRoute && (
    Boolean(storyboardGridUrl) ||
    contentStructure.length > 0 ||
    scriptSummary.original.length > 0 ||
    scriptSummary.rewritten.length > 0 ||
    clonePromptSummary.rules.length > 0 ||
    clonePromptSummary.clips.length > 0 ||
    sourceAnalysisItems.length > 0 ||
    beatMapItems.length > 0 ||
    mechanismSections.length > 0 ||
    sceneDetailItems.length > 0
  );
  const isPreparingStoryboard = !errorText && segments.length === 0 && !hasRemixBreakdownResult;
  const canShowActionBar = !isRemixReviewMode && !loading && !errorText && segments.length > 0;

  const editingSegment = useMemo(
    () => segments.find((item) => item.id === editingSegmentId) || null,
    [segments, editingSegmentId],
  );
  const editingAssets = editingSegment ? getSegmentAssets(editingSegment, editingType) : [];
  const composerStyle = useMemo(
    () => (keyboardHeight > 0 ? { transform: `translateY(-${keyboardHeight}px)` } : undefined),
    [keyboardHeight],
  );

  useEffect(() => {
    if (!autoOpenEdit || autoOpenedEdit || loading || errorText || !isRemixRoute || segments.length === 0) return;
    setAutoOpenedEdit(true);
    handleEditReplace(segments[0], 'product');
  }, [autoOpenEdit, autoOpenedEdit, loading, errorText, isRemixRoute, segments]);

  const handleOpenReferenceVideo = () => {
    if (!remixOriginalVideoUrl) {
      Taro.showToast({ title: '暂无原视频', icon: 'none' });
      return;
    }
    Taro.navigateTo({
      url: `/subpages/work-detail/index?id=${encodeURIComponent(`${task?.id || taskId}:reference-video`)}`,
      success: () => {
        Taro.setStorageSync('WORK_DETAIL_ITEM', {
          id: `${task?.id || taskId}:reference-video`,
          title: '原视频',
          type: 'video',
          status: task?.status || 'BREAKDOWN_COMPLETED',
          createdAt: new Date().toISOString(),
          preview: remixOriginalVideoUrl,
          thumbnailUrl: remixOriginalPosterUrl || null,
          metadata: null,
          source: 'task',
        });
      },
    });
  };

  return (
    <View className='storyboard-board-page'>
      <View className='storyboard-board-nav'>
        <View className='storyboard-board-back' onClick={handleBack}>
          <Text className='storyboard-board-back-text'>‹</Text>
        </View>
        <Text className='storyboard-board-nav-title'>{isRemixRoute ? '一键复刻' : '分镜板'}</Text>
        <View className='storyboard-board-nav-spacer' />
      </View>

      <ScrollView scrollY className={`storyboard-board-scroll ${isRemixReviewMode ? 'storyboard-board-scroll--review' : ''}`}>
        {!isRemixRoute && <View className='storyboard-board-header'>
          <Text className='storyboard-board-title'>{isRemixRoute ? '一键复刻' : (title || '分镜任务')}</Text>
        </View>}

        {!loading && !errorText && isRemixRoute && (
          <View className='remix-stage-section'>
            <View className='remix-stage-track'>
              {remixStageItems.map((stage, index) => (
                <View
                  key={stage.key}
                  className={`remix-stage-item ${activeRemixStage === stage.key ? 'remix-stage-item--selected' : ''}`}
                  onClick={() => setSelectedRemixStage(stage.key)}
                >
                  <View className={`remix-stage-dot remix-stage-dot--${stage.state} ${activeRemixStage === stage.key ? 'remix-stage-dot--selected' : ''}`}>
                    <Text className='remix-stage-dot-text'>{index + 1}</Text>
                  </View>
                  {index < remixStageItems.length - 1 && <View className={`remix-stage-line remix-stage-line--${stage.state}`} />}
                  <Text className={`remix-stage-name remix-stage-name--${stage.state} ${activeRemixStage === stage.key ? 'remix-stage-name--selected' : ''}`}>{stage.title}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {!loading && !errorText && isRemixRoute && activeRemixStage === 'breakdown' && (
          <View className={isRemixReviewMode ? 'remix-review-section remix-original-section' : 'remix-original-section remix-original-section--board'}>
            <View className='remix-review-section-head'>
              <Text className='storyboard-section-title'>原视频</Text>
              <Text className='remix-review-section-note'>点击查看</Text>
            </View>
            <View className={`remix-original-card ${!remixOriginalVideoUrl ? 'remix-original-card--empty' : ''}`} onClick={handleOpenReferenceVideo}>
              {remixOriginalPosterUrl ? (
                <Image className='remix-original-poster' src={remixOriginalPosterUrl} mode='aspectFill' />
              ) : (
                <View className='remix-original-placeholder'>
                  <Text className='remix-original-placeholder-text'>原视频</Text>
                </View>
              )}
              <View className='remix-original-overlay'>
                <View className='remix-original-play'>
                  <Text className='remix-original-play-text'>▶</Text>
                </View>
                <View className='remix-original-copy'>
                  <Text className='remix-original-title'>查看原视频</Text>
                  <Text className='remix-original-desc'>{remixOriginalVideoUrl ? '用于对照动作、节奏和镜头' : '当前任务未保存原视频地址'}</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {!loading && !errorText && isRemixRoute && storyboardGridBoards.length > 0 && (
          <View className={isRemixReviewMode ? 'remix-review-section' : 'storyboard-grid-section'}>
            <View className='remix-review-section-head'>
              <Text className='storyboard-section-title'>分镜网格图</Text>
              <Text className='remix-review-section-note'>点击可放大查看关键帧</Text>
            </View>
            {storyboardGridBoards.map((board, index) => {
              return (
                <View key={`${board.url}-${index}`} className='storyboard-grid-board'>
                  {storyboardGridBoards.length > 1 && (
                    <Text className='storyboard-grid-board-title'>
                      分镜板 {index + 1}{board.timeRange ? ` · ${board.timeRange}` : ''}
                    </Text>
                  )}
                  <Image
                    className='storyboard-grid-image'
                    src={board.url}
                    mode='widthFix'
                    onClick={() => {
                      Taro.previewImage({ current: board.url, urls: storyboardGridBoards.map((item) => item.url) });
                    }}
                  />
                </View>
              );
            })}
          </View>
        )}

        {!loading && !errorText && isRemixRoute && contentStructure.length > 0 && (
          <View className={isRemixReviewMode ? 'remix-review-section' : 'storyboard-structure-section'}>
            <Text className='storyboard-section-title'>拆解总结</Text>
            {contentStructure.map((item) => (
              <View key={item.key} className='storyboard-structure-item'>
                <Text className='storyboard-structure-title'>{item.label}{item.timeRange ? ` · ${item.timeRange}` : ''}</Text>
                <Text className='storyboard-structure-text'>{item.summary}</Text>
                {!!item.mechanism && <Text className='storyboard-structure-note'>{item.mechanism}</Text>}
              </View>
            ))}
          </View>
        )}

        {!loading && !errorText && isRemixRoute && sourceAnalysisItems.length > 0 && (
          <View className={isRemixReviewMode ? 'remix-review-section' : 'storyboard-analysis-section'}>
            <Text className='storyboard-section-title'>源视频分析</Text>
            <View className='storyboard-analysis-grid'>
              {sourceAnalysisItems.map((item) => (
                <View key={item.key} className='storyboard-analysis-item'>
                  <Text className='storyboard-analysis-label'>{item.label}</Text>
                  <Text className='storyboard-analysis-value'>{item.value}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {!loading && !errorText && isRemixRoute && beatMapItems.length > 0 && (
          <View className={isRemixReviewMode ? 'remix-review-section' : 'storyboard-beat-section'}>
            <Text className='storyboard-section-title'>节奏拆解</Text>
            {beatMapItems.map((beat, index) => (
              <View key={`${beat.beat}-${index}`} className='storyboard-beat-item'>
                  <Text className='storyboard-beat-title'>{beat.beat}{beat.timeRange ? ` · ${beat.timeRange}` : ''}</Text>
                  {!!beat.visual && <Text className='storyboard-beat-text'>画面：{beat.visual}</Text>}
                  {!!beat.dialogue && <Text className='storyboard-beat-text'>口播/字幕：{beat.dialogue}</Text>}
                  {!!beat.rewrittenDialogue && <Text className='storyboard-beat-text'>改写：{beat.rewrittenDialogue}</Text>}
                  {!!beat.functionText && <Text className='storyboard-beat-note'>作用：{beat.functionText}</Text>}
                  {!!beat.replicationNote && <Text className='storyboard-beat-note'>复刻要点：{beat.replicationNote}</Text>}
                </View>
            ))}
          </View>
        )}

        {!loading && !errorText && isRemixRoute && (scriptSummary.original.length > 0 || scriptSummary.rewritten.length > 0) && (
          <View className={isRemixReviewMode ? 'remix-review-section' : 'storyboard-script-section'}>
            <Text className='storyboard-section-title'>口播文案</Text>
            {scriptSummary.original.length > 0 && (
              <View className='storyboard-script-block'>
                <Text className='storyboard-script-title'>原始口播</Text>
                {scriptSummary.original.map((line, index) => (
                  <View key={`${line.timeRange}-${index}`} className='storyboard-script-line-row'>
                    {shouldShowScriptTime(line.timeRange) && <Text className='storyboard-script-time'>{line.timeRange}</Text>}
                    <Text className='storyboard-script-line'>{line.text}</Text>
                  </View>
                ))}
              </View>
            )}
            {scriptSummary.rewritten.length > 0 && (
              <View className='storyboard-script-block'>
                <Text className='storyboard-script-title'>改写口播</Text>
                {scriptSummary.rewritten.map((line, index) => (
                  <View key={`${line.timeRange}-${index}`} className='storyboard-script-line-row'>
                    {shouldShowScriptTime(line.timeRange) && <Text className='storyboard-script-time'>{line.timeRange}</Text>}
                    <Text className='storyboard-script-line'>{line.text}</Text>
                  </View>
                ))}
              </View>
            )}
            {scriptSummary.rewritten.length === 0 && (
              <View className='storyboard-script-block'>
                <Text className='storyboard-script-title'>改写口播</Text>
                <Text className='storyboard-script-line storyboard-script-line--muted'>暂无完整改写口播，请重新运行更新后的拆解工作流。</Text>
              </View>
            )}
          </View>
        )}

        {!loading && !errorText && isRemixRoute && mechanismSections.length > 0 && (
          <View className={isRemixReviewMode ? 'remix-review-section' : 'storyboard-mechanism-section'}>
            <Text className='storyboard-section-title'>爆款机制</Text>
            {mechanismSections.map((section) => (
              <View key={section.key} className='storyboard-mechanism-block'>
                <Text className='storyboard-mechanism-title'>{section.label}</Text>
                <Text className='storyboard-mechanism-text'>{section.items.join(' / ')}</Text>
              </View>
            ))}
          </View>
        )}

        {!loading && !errorText && isRemixRoute && (clonePromptSummary.rules.length > 0 || clonePromptSummary.clips.length > 0) && (
          <View className={isRemixReviewMode ? 'remix-review-section' : 'storyboard-clone-section'}>
            <Text className='storyboard-section-title'>提示词汇总</Text>
            {clonePromptSummary.rules.map((rule) => (
              <View key={rule.key} className='storyboard-clone-rule'>
                <Text className='storyboard-clone-title'>{rule.label}</Text>
                <Text className='storyboard-clone-prompt'>{rule.text}</Text>
              </View>
            ))}
            {clonePromptSummary.clips.map((clip, index) => (
              <View key={`${clip.clipIndex}-${index}`} className='storyboard-clone-item'>
                <Text className='storyboard-clone-title'>Clip {clip.clipIndex}{clip.duration ? ` · ${clip.duration}s` : ''}{clip.timeRange ? ` · ${clip.timeRange}` : ''}</Text>
                {!!clip.imagePrompt && <Text className='storyboard-clone-prompt'>首帧提示词：{clip.imagePrompt}</Text>}
                {!!clip.videoPrompt && <Text className='storyboard-clone-prompt'>视频提示词：{clip.videoPrompt}</Text>}
              </View>
            ))}
          </View>
        )}

        {!loading && !errorText && isRemixReviewMode && sceneDetailItems.length > 0 && (
          <View className='remix-review-section'>
            <Text className='storyboard-section-title'>镜头拆解明细</Text>
            {sceneDetailItems.map((scene, index) => (
              <View key={`${scene.order}-${index}`} className='remix-review-shot'>
                <View className='remix-review-shot-head'>
                  <Text className='remix-review-shot-title'>镜头 {scene.order}</Text>
                  <Text className='remix-review-shot-time'>{scene.duration || 0}s {scene.timeRange ? `| ${scene.timeRange}` : ''}</Text>
                </View>
                {!!scene.goal && <Text className='remix-review-shot-text'>目标：{scene.goal}</Text>}
                {!!scene.visual && <Text className='remix-review-shot-text'>画面：{scene.visual}</Text>}
                {!!scene.camera && <Text className='remix-review-shot-text'>镜头：{scene.camera}</Text>}
                {!!scene.lighting && <Text className='remix-review-shot-text'>光线：{scene.lighting}</Text>}
                {!!scene.action && <Text className='remix-review-shot-text'>动作：{scene.action}</Text>}
                {!!scene.product && <Text className='remix-review-shot-text'>产品：{scene.product}</Text>}
              </View>
            ))}
          </View>
        )}

        {!loading && !errorText && !isRemixReviewMode && references.length > 0 && (
          <View className='storyboard-reference-section'>
            <Text className='storyboard-reference-title'>主体参考</Text>
            <View className='storyboard-reference-list'>
              {references.map((ref) => (
                <View key={`${ref.type}-${ref.id}`} className='storyboard-reference-card'>
                  <View className='storyboard-reference-image-wrap'>
                    {ref.imageUrl ? (
                      <Image className='storyboard-reference-image' src={ref.imageUrl} mode='aspectFill' />
                    ) : (
                      <Text className='storyboard-reference-placeholder'>{ref.type === 'character' ? '角色' : '产品'}</Text>
                    )}
                  </View>
                  <View className='storyboard-reference-info'>
                    <Text className='storyboard-reference-label'>{ref.type === 'character' ? '参考角色' : '参考产品'}</Text>
                    <Text className='storyboard-reference-name'>{ref.name}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {!loading && !errorText && isRemixReviewMode && segments.length > 0 && clonePromptSummary.clips.length === 0 && sceneDetailItems.length === 0 && (
          <View className='remix-review-section'>
            <Text className='storyboard-section-title'>分镜拆解明细</Text>
            {segments.map((segment, index) => (
              <View key={segment.id} className='remix-review-shot'>
                <View className='remix-review-shot-head'>
                  <Text className='remix-review-shot-title'>镜头 {getSegmentDisplayOrder(segment, index)}</Text>
                  <Text className='remix-review-shot-time'>{segment.duration || 0}s {segment.timeRange ? `| ${segment.timeRange}` : ''}</Text>
                </View>
                {!!normalizeText(segment.originalScript) && (
                  <Text className='remix-review-shot-text'>脚本：{normalizeText(segment.originalScript)}</Text>
                )}
                {!!normalizeText(segment.rewrittenScript || '') && (
                  <Text className='remix-review-shot-text'>改写：{normalizeText(segment.rewrittenScript || '')}</Text>
                )}
                {!!normalizeText(segment.imagePrompt) && (
                  <Text className='remix-review-shot-text'>首帧提示词：{normalizeText(segment.imagePrompt)}</Text>
                )}
                {!!normalizeText(segment.videoPrompt) && (
                  <Text className='remix-review-shot-text'>视频提示词：{normalizeText(segment.videoPrompt)}</Text>
                )}
              </View>
            ))}
          </View>
        )}

        {isRemixReviewMode && !loading && !errorText && (
          <View className='remix-review-footer-space' />
        )}

        {(loading || isPreparingStoryboard) && (
            <View className='storyboard-board-pending'>
              <View className='storyboard-board-spinner'>
                <View className='storyboard-board-spinner-core' />
              </View>
            <Text className='storyboard-board-pending-title'>{isRemixRoute ? getPendingTitle(taskMetadata) : '正在生成分镜'}</Text>
            {!isRemixRoute && <Text className='storyboard-board-pending-text'>任务已在后端运行，退出页面后也会继续处理</Text>}
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

        {!isRemixReviewMode && !loading && !errorText && segments.length > 0 && (
          <View className='storyboard-board-list'>
            {segments.map((segment, index) => (
              <View key={segment.id} className='storyboard-segment-card'>
                {(() => {
                  const imageUrl = normalizeMediaUrl(segment.generatedImage);
                  const videoUrl = normalizeMediaUrl(segment.generatedVideo);
                  const showImage = Boolean(imageUrl) && !Boolean(imageErrorMap[segment.id]);
                  const showVideo = Boolean(videoUrl) && !Boolean(videoErrorMap[segment.id]);
                  const statusText = String(segment.status || '').toUpperCase();
                  const imageGenerating = !showImage && statusText.includes('IMAGE_GENERATING');
                  const videoGenerating = !showVideo && statusText.includes('VIDEO_GENERATING');
                  const imageFailed = !showImage && statusText.includes('IMAGE') && (statusText.includes('FAIL') || statusText.includes('ERROR'));
                  const videoFailed = !showVideo && statusText.includes('VIDEO') && (statusText.includes('FAIL') || statusText.includes('ERROR'));
                  return (
                    <>
                <View className='storyboard-segment-head'>
                  <Text className='storyboard-segment-order'>镜头 {getSegmentDisplayOrder(segment, index)}</Text>
                  <Text className='storyboard-segment-status'>{toStatusText(segment.status || '')}</Text>
                </View>
                <Text className='storyboard-segment-meta'>时长：{segment.duration || 0}s {segment.timeRange ? `| ${segment.timeRange}` : ''}</Text>
                {!!normalizeText(segment.originalScript) && (
                  <Text className='storyboard-segment-text'>脚本：{normalizeText(segment.originalScript)}</Text>
                )}
                {!!normalizeText(segment.rewrittenScript || '') && (
                  <Text className='storyboard-segment-text'>改写：{normalizeText(segment.rewrittenScript || '')}</Text>
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
                    <View className='storyboard-asset-stage' onClick={() => (isViralRemix ? handleEditReplace(segment, 'product') : handleEditPrompt(segment, 'image'))}>
                      {showImage ? (
                        <Image
                          className='storyboard-asset-image'
                          src={imageUrl as string}
                          mode='aspectFit'
                          onLoad={() => setImageFailed(segment.id, false)}
                          onError={() => setImageFailed(segment.id, true)}
                        />
                      ) : (
                        <View className={`storyboard-asset-placeholder ${imageGenerating ? 'storyboard-asset-placeholder--generating' : ''} ${imageFailed ? 'storyboard-asset-placeholder--failed' : ''}`}>
                          {imageGenerating ? (
                            <>
                              <View className='storyboard-asset-spinner' />
                              <Text className='storyboard-asset-placeholder-title'>图片生成中</Text>
                              <Text className='storyboard-asset-placeholder-sub'>完成后会自动更新</Text>
                            </>
                          ) : imageFailed ? (
                            <>
                              <Image className='storyboard-asset-placeholder-icon storyboard-asset-placeholder-icon--image' src={imageIcon} mode='aspectFit' />
                              <Text className='storyboard-asset-placeholder-title'>图片生成失败</Text>
                              <View
                                className='storyboard-asset-retry'
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleRegenerateImage(segment);
                                }}
                              >
                                <Text className='storyboard-asset-retry-text'>重新生成</Text>
                              </View>
                            </>
                          ) : (
                            <Image className='storyboard-asset-placeholder-icon storyboard-asset-placeholder-icon--image' src={imageIcon} mode='aspectFit' />
                          )}
                        </View>
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
                        <View className={`storyboard-asset-placeholder ${videoGenerating ? 'storyboard-asset-placeholder--generating' : ''} ${videoFailed ? 'storyboard-asset-placeholder--failed' : ''}`}>
                          {videoGenerating ? (
                            <>
                              <View className='storyboard-asset-spinner' />
                              <Text className='storyboard-asset-placeholder-title'>视频生成中</Text>
                              <Text className='storyboard-asset-placeholder-sub'>完成后会自动更新</Text>
                            </>
                          ) : videoFailed ? (
                            <>
                              <Image className='storyboard-asset-placeholder-icon storyboard-asset-placeholder-icon--video' src={videoIcon} mode='aspectFit' />
                              <Text className='storyboard-asset-placeholder-title'>视频生成失败</Text>
                              <View
                                className='storyboard-asset-retry'
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleRegenerateVideo(segment);
                                }}
                              >
                                <Text className='storyboard-asset-retry-text'>重新生成</Text>
                              </View>
                            </>
                          ) : (
                            <Image className='storyboard-asset-placeholder-icon storyboard-asset-placeholder-icon--video' src={videoIcon} mode='aspectFit' />
                          )}
                        </View>
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

      {isRemixReviewMode && !loading && !errorText && (
        <View className='remix-review-action-bar'>
          <View
            className='remix-review-bottom-btn remix-review-bottom-btn--danger'
            onClick={() => void handleDeleteTask('delete')}
          >
            <Text className='remix-review-bottom-btn-text remix-review-bottom-btn-text--danger'>
              {deleting ? '删除中' : '删除'}
            </Text>
          </View>
          {remixOriginalVideoUrl && (
            <View
              className='remix-review-bottom-btn remix-review-bottom-btn--ghost'
              onClick={handleOpenReferenceVideo}
            >
              <Text className='remix-review-bottom-btn-text remix-review-bottom-btn-text--ghost'>查看原视频</Text>
            </View>
          )}
          <View
            className='remix-review-bottom-btn remix-review-bottom-btn--primary'
            onClick={() => {
              Taro.redirectTo({
                url: `/subpages/storyboard-board/index?id=${encodeURIComponent(taskId)}&title=${encodeURIComponent(title || '一键复刻')}&mode=remix-board&openEdit=replace`,
              });
            }}
          >
            <Text className='remix-review-bottom-btn-text'>替换产品/角色</Text>
          </View>
        </View>
      )}

      {canShowActionBar && (
      <View className='storyboard-action-bar'>
        <View className='storyboard-action-row storyboard-action-row--primary'>
          {isRemixRoute && (
            <View
              className='storyboard-delete-bottom-btn'
              onClick={() => void handleDeleteTask('delete')}
            >
              <Text className='storyboard-delete-bottom-btn-text'>{deleting ? '删除中' : '删除'}</Text>
            </View>
          )}
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
            <View className='storyboard-edit-head'>
              <View className='storyboard-edit-back' onClick={closeEditPrompt}>
                <Text className='storyboard-edit-back-text'>‹</Text>
              </View>
              <Text className='storyboard-edit-title'>镜头 {getSegmentDisplayOrder(editingSegment, segments.findIndex((item) => item.id === editingSegment.id))} · {editingType === 'image' ? '图片' : '视频'}</Text>
              <View className='storyboard-edit-head-spacer' />
            </View>
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
              {editingType === 'image' && isRemixRoute && (
                <View className='storyboard-edit-quick-actions'>
                  <View
                    className='storyboard-edit-quick-btn'
                    onClick={() => applyReplaceMode('product')}
                  >
                    <Text className='storyboard-edit-quick-btn-text'>换产品</Text>
                  </View>
                  <View
                    className='storyboard-edit-quick-btn'
                    onClick={() => applyReplaceMode('character')}
                  >
                    <Text className='storyboard-edit-quick-btn-text'>换角色</Text>
                  </View>
                </View>
              )}
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
  if (/^(undefined|null|nan)$/i.test(raw)) return '';
  if (raw.startsWith('//')) return `https:${raw}`;
  if (!/^https?:\/\//i.test(raw) && !raw.startsWith('/')) return '';
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

function getStoryboardGridBoards(task: StoryboardTaskStatusResult | null): Array<{ url: string; timeRange: string; kind: 'full' | 'clip' }> {
  const detailed = asRecord(task?.detailedBreakdown);
  const workflowData = getWorkflowData(task);
  const clipBoards: Array<{ url: string; timeRange: string; kind: 'full' | 'clip' }> = [];
  const fullBoards: Array<{ url: string; timeRange: string; kind: 'full' | 'clip' }> = [];

  const primaryUrl = normalizeMediaUrl(
    String(
      task?.storyboardImageUrl ||
      task?.coverImage ||
      detailed?.storyboard_grid_url ||
      detailed?.storyboardGridUrl ||
      workflowData.storyboard_grid_url ||
      workflowData.storyboardGridUrl ||
      '',
    ),
  );
  if (primaryUrl) fullBoards.push({ url: primaryUrl, timeRange: '总览', kind: 'full' });

  for (const board of toRecordArray(workflowData.clip_boards)) {
    const url = normalizeMediaUrl(String(board.grid_url || board.gridUrl || board.oss_url || board.url || ''));
    if (!url) continue;
    clipBoards.push({
      url,
      timeRange: normalizeText(String(board.time_range || board.timeRange || '')),
      kind: 'clip',
    });
  }

  const seen = new Set<string>();
  return [...(clipBoards.length > 0 ? clipBoards : fullBoards)].filter((board) => {
    if (seen.has(board.url)) return false;
    seen.add(board.url);
    return true;
  });
}

function getSegmentDisplayOrder(segment: StoryboardSegmentItem, index: number): number {
  const raw = Number(segment.order);
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  return index >= 0 ? index + 1 : 1;
}

function getRemixReferenceVideoUrl(
  metadata: Record<string, unknown>,
  task: StoryboardTaskStatusResult | null,
): string {
  const detailed = asRecord(task?.detailedBreakdown);
  const workflowData = getWorkflowData(task);
  return normalizeMediaUrl(
    String(
      metadata.referenceVideoUrl ||
        metadata.reference_video_url ||
        metadata.videoUrl ||
        metadata.video_url ||
        detailed?.reference_video_url ||
        detailed?.referenceVideoUrl ||
        workflowData.reference_video_url ||
        workflowData.referenceVideoUrl ||
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

function getSourceAnalysisItems(workflowData: Record<string, unknown>): Array<{ key: string; label: string; value: string }> {
  const analysis = asRecord(workflowData.source_video_analysis) || asRecord(workflowData.sourceVideoAnalysis);
  if (!analysis) return [];
  const fields = [
    ['style_name', '风格'],
    ['format', '形式'],
    ['duration', '时长'],
    ['aspect_ratio', '画幅'],
    ['shot_count', '镜头数'],
    ['dialogue_word_count', '对白词数'],
    ['dialogue_pattern', '口播结构'],
    ['edit_rhythm', '剪辑节奏'],
    ['camera_language', '镜头语言'],
    ['technical_texture', '技术质感'],
    ['product_role', '产品角色'],
  ] as const;
  return fields
    .map(([key, label]) => {
      const value = normalizeText(String(analysis[key] || analysis[toCamelKey(key)] || ''));
      return value ? { key, label, value } : null;
    })
    .filter((item): item is { key: string; label: string; value: string } => Boolean(item));
}

function getBeatMapItems(workflowData: Record<string, unknown>): Array<{
  timeRange: string;
  beat: string;
  visual: string;
  dialogue: string;
  rewrittenDialogue: string;
  functionText: string;
  replicationNote: string;
}> {
  return toRecordArray(workflowData.beat_map || workflowData.beatMap)
    .map((row, index) => ({
      timeRange: normalizeText(String(row.time_range || row.timeRange || '')),
      beat: normalizeText(String(row.beat || `Beat ${index + 1}`)),
      visual: normalizeText(String(row.visual || '')),
      dialogue: normalizeText(String(row.dialogue_or_text || row.dialogue || row.text || '')),
      rewrittenDialogue: normalizeText(String(row.rewritten_dialogue_or_text || row.rewrittenDialogueOrText || row.rewritten_dialogue || '')),
      functionText: normalizeText(String(row.function || row.functionText || '')),
      replicationNote: normalizeText(String(row.replication_note || row.replicationNote || row.note || '')),
    }))
    .filter((item) => item.beat || item.visual || item.dialogue || item.rewrittenDialogue || item.functionText || item.replicationNote);
}

function getMechanismSections(workflowData: Record<string, unknown>): Array<{ key: string; label: string; items: string[] }> {
  const viralMechanism = asRecord(workflowData.viral_mechanism) || asRecord(workflowData.viralMechanism) || {};
  const sectionDefs: Array<[string, string, unknown]> = [
    ['core_idea', '核心机制', viralMechanism.core_idea || viralMechanism.coreIdea],
    ['attention_triggers', '注意力触发', viralMechanism.attention_triggers || viralMechanism.attentionTriggers],
    ['retention_devices', '留存手段', viralMechanism.retention_devices || viralMechanism.retentionDevices],
    ['trust_devices', '信任手段', viralMechanism.trust_devices || viralMechanism.trustDevices],
    ['conversion_devices', '转化手段', viralMechanism.conversion_devices || viralMechanism.conversionDevices],
    ['defining_traits', '差异化特征', workflowData.defining_traits || workflowData.definingTraits],
    ['what_transfers', '可迁移元素', workflowData.what_transfers || workflowData.whatTransfers],
    ['what_gets_swapped', '需要替换元素', workflowData.what_gets_swapped || workflowData.whatGetsSwapped],
  ];
  return sectionDefs
    .map(([key, label, value]) => {
      const items = toTextList(value);
      return items.length > 0 ? { key, label, items } : null;
    })
    .filter((item): item is { key: string; label: string; items: string[] } => Boolean(item));
}

function getSceneDetailItems(
  workflowData: Record<string, unknown>,
  segments: StoryboardSegmentItem[],
): Array<{
  order: number;
  timeRange: string;
  duration: number;
  goal: string;
  visual: string;
  camera: string;
  lighting: string;
  action: string;
  product: string;
}> {
  const rows = [
    ...toRecordArray(workflowData.scenes),
    ...toRecordArray(workflowData.scene_breakdown),
    ...toRecordArray(workflowData.shots),
  ];
  const beatRows = toRecordArray(workflowData.beat_map);
  if (rows.length > 0) {
    const detailRows = rows.map((row, index) => ({
      order: Number(row.order || row.shot_no || row.shotNo || index + 1) || index + 1,
      timeRange: normalizeText(String(row.time_range || row.timeRange || '')),
      duration: Number(row.duration || row.duration_sec || row.durationSec || 0) || 0,
      goal: normalizeText(String(row.shot_goal || row.shotGoal || '')),
      visual: normalizeText(String(row.visual_content_description || row.visualDescription || row.visual_description || '')),
      camera: normalizeText(String(
        row.camera_notes ||
        [row.camera_shot_size, row.camera_angle, row.camera_movement].filter(Boolean).join(' / ') ||
        '',
      )),
      lighting: normalizeText(String(row.lighting_notes || row.lighting_atmosphere || row.lightingAtmosphere || '')),
      action: normalizeText(String(row.action_blocking || row.actionBlocking || '')),
      product: normalizeText(String(row.product_desc || row.productDesc || '')),
    }));
    if (beatRows.length <= detailRows.length) return detailRows;
    return beatRows.map((beat, index) => {
      const matched = detailRows.find((scene) => scene.timeRange && scene.timeRange === normalizeText(String(beat.time_range || beat.timeRange || ''))) || detailRows[index];
      return {
        order: Number(beat.order || index + 1) || index + 1,
        timeRange: normalizeText(String(beat.time_range || beat.timeRange || matched?.timeRange || '')),
        duration: matched?.duration || 0,
        goal: matched?.goal || normalizeText(String(beat.function || beat.functionText || beat.beat || '')),
        visual: matched?.visual || normalizeText(String(beat.visual || '')),
        camera: matched?.camera || normalizeText(String(beat.replication_note || beat.replicationNote || '')),
        lighting: matched?.lighting || '',
        action: matched?.action || normalizeText(String(beat.replication_note || beat.replicationNote || '')),
        product: matched?.product || '',
      };
    });
  }

  if (beatRows.length > 0) {
    return beatRows.map((beat, index) => ({
      order: Number(beat.order || index + 1) || index + 1,
      timeRange: normalizeText(String(beat.time_range || beat.timeRange || '')),
      duration: 0,
      goal: normalizeText(String(beat.function || beat.functionText || beat.beat || '')),
      visual: normalizeText(String(beat.visual || '')),
      camera: normalizeText(String(beat.replication_note || beat.replicationNote || '')),
      lighting: '',
      action: normalizeText(String(beat.replication_note || beat.replicationNote || '')),
      product: '',
    }));
  }

  return segments.map((segment, index) => ({
    order: getSegmentDisplayOrder(segment, index),
    timeRange: normalizeText(segment.timeRange || ''),
    duration: Number(segment.duration || 0) || 0,
    goal: '',
    visual: normalizeText(String(segment.generationParams?.visual_description || '')),
    camera: '',
    lighting: '',
    action: '',
    product: '',
  }));
}

function toTextList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(String(item || ''))).filter(Boolean);
  }
  const text = normalizeText(String(value || ''));
  return text ? [text] : [];
}

function getScriptSummary(
  workflowData: Record<string, unknown>,
  segments: StoryboardSegmentItem[],
): {
  original: Array<{ timeRange: string; text: string }>;
  rewritten: Array<{ timeRange: string; text: string }>;
} {
  const original: Array<{ timeRange: string; text: string }> = [];
  const rewritten: Array<{ timeRange: string; text: string }> = [];
  const beatOriginal: Array<{ timeRange: string; text: string }> = [];
  const beatRewritten: Array<{ timeRange: string; text: string }> = [];
  const fullOriginal = normalizeText(String(workflowData.full_original_script || workflowData.fullOriginalScript || ''));
  const fullRewritten = normalizeText(String(workflowData.full_rewritten_script || workflowData.fullRewrittenScript || ''));

  for (const segment of segments) {
    const timeRange = normalizeText(segment.timeRange || '');
    const originalText = normalizeText(segment.originalScript || '');
    const rewrittenText = normalizeText(segment.rewrittenScript || '');
    if (originalText) original.push({ timeRange, text: originalText });
    if (rewrittenText) rewritten.push({ timeRange, text: rewrittenText });
  }

  const sceneRows = [
    ...toRecordArray(workflowData.scenes),
    ...toRecordArray(workflowData.scene_breakdown),
    ...toRecordArray(workflowData.shots),
  ];
  for (const row of sceneRows) {
    const timeRange = normalizeText(String(row.time_range || row.timeRange || ''));
    const originalText = normalizeText(String(
      row.original_script ||
        row.dialogue_vo_original ||
        row.dialogue_or_text ||
        row.on_screen_text_graphics ||
        row.text ||
        '',
    ));
    const rewrittenText = normalizeText(String(
      row.rewritten_script ||
        row.rewrite_vo_zh_translation ||
        row.rewrite_vo_target_language ||
        row.rewritten_text ||
        '',
    ));
    if (originalText) original.push({ timeRange, text: originalText });
    if (rewrittenText) rewritten.push({ timeRange, text: rewrittenText });
  }

  for (const row of toRecordArray(workflowData.beat_map)) {
    const text = normalizeText(String(row.dialogue_or_text || row.dialogue || row.text || ''));
    const rewrittenText = normalizeText(String(row.rewritten_dialogue_or_text || row.rewrittenDialogueOrText || ''));
    const timeRange = normalizeText(String(row.time_range || row.timeRange || ''));
    if (text) beatOriginal.push({ timeRange, text });
    if (rewrittenText) beatRewritten.push({ timeRange, text: rewrittenText });
  }

  const originalSource = fullOriginal
    ? [{ timeRange: '全文', text: fullOriginal }]
    : (beatOriginal.length > 0 ? beatOriginal : original);
  const rewrittenSource = fullRewritten
    ? [{ timeRange: '全文', text: fullRewritten }]
    : (beatRewritten.length > 0 ? beatRewritten : rewritten);
  const originalLines = uniqueScriptLines(originalSource);
  const rewrittenLines = uniqueScriptLines(rewrittenSource)
    .filter((line) => !originalLines.some((item) => normalizeComparableText(item.text) === normalizeComparableText(line.text)));

  return { original: originalLines, rewritten: rewrittenLines };
}

function shouldShowScriptTime(value: string): boolean {
  const text = normalizeText(value);
  return Boolean(text && text !== '全文' && text !== '完整');
}

function toRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item));
}

function uniqueScriptLines(lines: Array<{ timeRange: string; text: string }>): Array<{ timeRange: string; text: string }> {
  const seen = new Set<string>();
  const result: Array<{ timeRange: string; text: string }> = [];
  for (const line of lines) {
    const text = normalizeText(line.text);
    if (!text) continue;
    const key = normalizeComparableText(text);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ timeRange: line.timeRange, text });
  }
  return result;
}

function normalizeComparableText(value: string): string {
  return normalizeText(value).toLowerCase().replace(/\s+/g, ' ');
}

function getClonePromptSummary(
  workflowData: Record<string, unknown>,
  segments: StoryboardSegmentItem[],
): {
  rules: Array<{ key: string; label: string; text: string }>;
  clips: Array<{
    clipIndex: number;
    timeRange: string;
    duration: number;
    imagePrompt: string;
    videoPrompt: string;
  }>;
} {
  const clonePrompt = asRecord(workflowData.clone_prompt) || asRecord(workflowData.clonePrompt);
  const ruleFields = [
    ['generation_strategy', '生成策略'],
    ['global_style_rules', '全局风格规则'],
    ['global_negative_rules', '全局负面规则'],
    ['dialogue_adaptation_rules', '口播改写规则'],
  ] as const;
  const rules = ruleFields
    .map(([key, label]) => {
      const text = normalizeText(String(clonePrompt?.[key] || clonePrompt?.[toCamelKey(key)] || ''));
      return text ? { key, label, text } : null;
    })
    .filter((item): item is { key: string; label: string; text: string } => Boolean(item));

  const clips = Array.isArray(clonePrompt?.clips) ? clonePrompt.clips : [];
  const promptClips = clips
    .map((item, index) => {
      const record = asRecord(item);
      if (!record) return null;
      const videoPrompt = normalizeText(String(record.prompt || record.video_prompt || record.videoPrompt || ''));
      const imagePrompt = normalizeText(String(record.image_prompt || record.imagePrompt || record.first_frame_prompt || ''));
      if (!videoPrompt && !imagePrompt) return null;
      return {
        clipIndex: Number(record.clip_index || record.clipIndex || index + 1) || index + 1,
        timeRange: normalizeText(String(record.time_range || record.timeRange || '')),
        duration: Number(record.duration || 0) || 0,
        imagePrompt,
        videoPrompt,
      };
    })
    .filter((item): item is {
      clipIndex: number;
      timeRange: string;
      duration: number;
      imagePrompt: string;
      videoPrompt: string;
    } => Boolean(item));

  if (promptClips.length > 0) return { rules, clips: promptClips };

  const segmentClips = segments
    .map((segment, index) => {
      const imagePrompt = normalizeText(segment.imagePrompt || '');
      const videoPrompt = normalizeText(segment.videoPrompt || '');
      if (!imagePrompt && !videoPrompt) return null;
      return {
        clipIndex: getSegmentDisplayOrder(segment, index),
        timeRange: normalizeText(segment.timeRange || ''),
        duration: Number(segment.duration || 0) || 0,
        imagePrompt,
        videoPrompt,
      };
    })
    .filter((item): item is {
      clipIndex: number;
      timeRange: string;
      duration: number;
      imagePrompt: string;
      videoPrompt: string;
    } => Boolean(item));

  return { rules, clips: segmentClips };
}

function toCamelKey(value: string): string {
  return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function buildRemixStages(
  task: StoryboardTaskStatusResult | null,
  segments: StoryboardSegmentItem[],
  metadata: Record<string, unknown>,
): Array<{ key: RemixStageKey; title: string; desc: string; state: 'done' | 'active' | 'todo' }> {
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
