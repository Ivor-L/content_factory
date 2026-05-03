import { View, Text, ScrollView, Image, Video, Textarea } from '@tarojs/components';
import Taro, { useDidShow, useLoad, usePullDownRefresh } from '@tarojs/taro';
import { useEffect, useMemo, useRef, useState } from 'react';
import { miniappApi } from '../../utils/miniapp-api';
import type { StoryboardSegmentItem, StoryboardTaskStatusResult } from '../../utils/miniapp-api';
import { api } from '../../utils/api';
import imageIcon from '../../assets/icons/storyboard-placeholder-image.svg';
import videoIcon from '../../assets/icons/storyboard-placeholder-video.svg';
import regenerateIcon from '../../assets/icons/storyboard-submit-regenerate.svg';
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
  const [demoMode, setDemoMode] = useState(false);
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
  const [editingRefs, setEditingRefs] = useState<Array<{ type: string; url: string; label?: string }>>([]);
  const [uploadingRef, setUploadingRef] = useState(false);
  const [editModelSheetOpen, setEditModelSheetOpen] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [actioningMap, setActioningMap] = useState<Record<string, boolean>>({});
  const [modelSheetOpen, setModelSheetOpen] = useState(false);
  const [imageErrorMap, setImageErrorMap] = useState<Record<string, boolean>>({});
  const [videoErrorMap, setVideoErrorMap] = useState<Record<string, boolean>>({});
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
    if (demoMode) {
      const demoTask = buildDemoTask(taskId);
      setTask(demoTask);
      setImageModel(demoTask.imageModel || 'nanoBananapro');
      setVideoModel(demoTask.videoModel || 'veo3.1-fast');
      setErrorText('');
      setLoading(false);
      return;
    }
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
    const incomingDemo = String(query?.demo || '').trim() === '1';
    if (!id) {
      setErrorText('缺少任务ID');
      setLoading(false);
      return;
    }
    setTaskId(id);
    if (incomingTitle) setTitle(incomingTitle);
    setDemoMode(incomingDemo);
  });

  useDidShow(() => {
    if (!taskId) return;
    void loadStatus(false);
  });

  useEffect(() => {
    if (!taskId) return;
    if (demoMode) {
      void loadStatus(false);
      return;
    }

    clearTimer();
    timerRef.current = setInterval(() => {
      if (!shouldKeepPolling) return;
      void loadStatus(true);
    }, POLL_INTERVAL) as unknown as number;

    return () => {
      clearTimer();
    };
  }, [taskId, shouldKeepPolling, demoMode]);

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
          thumbnailUrl: null,
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
    const rawParams = ((segment as unknown as { generationParams?: unknown }).generationParams || null) as
      | { subject_refs?: Array<{ type?: string; url?: string; label?: string }>; video_refs?: Array<{ type?: string; url?: string; label?: string }> }
      | null;
    const subjectRefs = Array.isArray(rawParams?.subject_refs)
      ? rawParams!.subject_refs
        .map((item) => ({ type: String(item?.type || 'custom'), url: String(item?.url || '').trim(), label: item?.label }))
        .filter((item) => item.url)
      : [];
    const videoRefs = Array.isArray(rawParams?.video_refs)
      ? rawParams!.video_refs
        .map((item) => ({ type: String(item?.type || 'custom'), url: String(item?.url || '').trim(), label: item?.label }))
        .filter((item) => item.url)
      : [];

    setEditingSegmentId(segment.id);
    setEditingType(type);
    setEditingPrompt(type === 'image' ? (segment.imagePrompt || '') : (segment.videoPrompt || ''));
    setEditingImageModel(imageModel);
    setEditingVideoModel(videoModel);
    setEditingRefs(type === 'image' ? subjectRefs : videoRefs);
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
      Taro.showToast({ title: error instanceof Error ? error.message : '上传失败', icon: 'none' });
    } finally {
      setUploadingRef(false);
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
      if (!demoMode) {
        await miniappApi.updateStoryboardSegment(segmentId, editingType === 'image'
          ? { imagePrompt: prompt, subject_refs: editingRefs }
          : { videoPrompt: prompt, video_refs: editingRefs });
      }
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
      if (demoMode) {
        upsertLocalSegment(segment.id, { status: 'IMAGE_GENERATING' });
        Taro.showToast({ title: '演示模式：已触发生图', icon: 'none' });
        return;
      }

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
      if (demoMode) {
        upsertLocalSegment(segment.id, { status: 'VIDEO_GENERATING' });
        Taro.showToast({ title: '演示模式：已触发视频生成', icon: 'none' });
        return;
      }

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
      if (demoMode) {
        targetSegments.forEach((segment) => upsertLocalSegment(segment.id, { status: 'IMAGE_GENERATING' }));
        Taro.showToast({ title: '演示模式：已一键生图', icon: 'none' });
        return;
      }

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
      if (demoMode) {
        targetSegments.forEach((segment) => upsertLocalSegment(segment.id, { status: 'VIDEO_GENERATING' }));
        Taro.showToast({ title: '演示模式：已一键生成视频', icon: 'none' });
        return;
      }

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
      if (demoMode) {
        Taro.showToast({ title: '演示模式：已触发一键剪辑', icon: 'none' });
        return;
      }
      await miniappApi.mergeStoryboard(taskId);
      Taro.showToast({ title: '已触发一键剪辑', icon: 'success' });
      await loadStatus(true);
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '触发失败', icon: 'none' });
    } finally {
      setActioning(actionKey, false);
    }
  };

  const segments = task?.segments || [];

  const editingSegment = useMemo(
    () => segments.find((item) => item.id === editingSegmentId) || null,
    [segments, editingSegmentId],
  );
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
        <Text className='storyboard-board-nav-title'>分镜板</Text>
        <View className='storyboard-board-nav-spacer' />
      </View>

      <ScrollView scrollY className='storyboard-board-scroll'>
        <View className='storyboard-board-header'>
          <Text className='storyboard-board-title'>{title || '分镜任务'}</Text>
        </View>

        {loading && (
          <View className='storyboard-board-state'>
            <Text className='storyboard-board-state-text'>分镜加载中...</Text>
          </View>
        )}

        {!loading && !!errorText && (
          <View className='storyboard-board-state'>
            <Text className='storyboard-board-state-text'>{errorText}</Text>
          </View>
        )}

        {!loading && !errorText && segments.length === 0 && (
          <View className='storyboard-board-state'>
            <Text className='storyboard-board-state-text'>脚本已提交，正在拆解分镜，请稍候下拉刷新</Text>
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
                      <Video className='storyboard-edit-preview-video' src={normalizeMediaUrl(editingSegment.generatedVideo)} controls />
                    ) : (
                      <Image className='storyboard-edit-preview-icon' src={videoIcon} mode='aspectFit' />
                    )
                  )}
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
                      <Image className='storyboard-edit-submit-icon' src={regenerateIcon} mode='aspectFit' />
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

function getModelLabel(
  list: Array<{ id: string; label: string }>,
  id: string,
): string {
  const found = list.find((item) => item.id === id);
  return found?.label || id || '默认模型';
}

function buildDemoTask(taskId: string): StoryboardTaskStatusResult {
  return {
    id: taskId,
    status: 'VIDEO_GENERATION_COMPLETED',
    progress: 88,
    imageModel: 'nanoBananapro',
    videoModel: 'veo3.1-fast',
    finalVideoUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    segments: [
      {
        id: `${taskId}-seg-1`,
        order: 0,
        duration: 5,
        timeRange: '00:00-00:05',
        imagePrompt: '产品置于黑色展台，机械骨骼缓慢展开，聚光灯扫过金属纹理',
        videoPrompt: '镜头推进，机械骨骼从静止到启动，工业风灯光，慢动作',
        generatedImage: 'https://picsum.photos/seed/skeleton-demo-1/960/1280',
        generatedVideo: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
        status: 'VIDEO_READY',
        originalScript: '开场展示产品主体，骨骼结构启动并形成强记忆点。',
      },
      {
        id: `${taskId}-seg-2`,
        order: 1,
        duration: 6,
        timeRange: '00:05-00:11',
        imagePrompt: '产品特写，参数标签环绕，蓝色HUD元素叠加',
        videoPrompt: '环绕运镜展示细节，参数标签逐条点亮，科技感',
        generatedImage: 'https://picsum.photos/seed/skeleton-demo-2/960/1280',
        generatedVideo: null,
        status: 'IMAGE_READY',
        originalScript: '切到细节特写，强调核心卖点与参数优势。',
      },
      {
        id: `${taskId}-seg-3`,
        order: 2,
        duration: 4,
        timeRange: '00:11-00:15',
        imagePrompt: '产品与品牌口号同框，背景渐变光墙，结束定格',
        videoPrompt: '镜头拉远形成品牌收束，字幕浮现，结尾停帧',
        generatedImage: null,
        generatedVideo: null,
        status: 'PENDING',
        originalScript: '品牌口号收尾，形成完整营销闭环。',
      },
    ],
  };
}
