import { View, Text, ScrollView, Image, Video, Textarea, Input } from '@tarojs/components';
import Taro, { useDidShow, useLoad, usePullDownRefresh } from '@tarojs/taro';
import { useEffect, useMemo, useRef, useState } from 'react';
import { miniappApi } from '../../utils/miniapp-api';
import type { StoryboardSegmentItem, StoryboardTaskStatusResult } from '../../utils/miniapp-api';
import './index.sass';

const POLL_INTERVAL = 4000;

const VIDEO_MODELS = [
  { id: 'bytedance/seedance-2', label: 'Seedance 2.0' },
  { id: 'bytedance/seedance-2-fast', label: 'Seedance 2.0 Fast' },
];
const DEFAULT_VIDEO_MODEL = 'bytedance/seedance-2';
const SMART_REMIX_VIDEO_STAGE_SOURCE = 'smart_remix_video_stage';
const MIN_SEEDANCE_DURATION = 4;
const MAX_SEEDANCE_DURATION = 15;

function normalizeVideoModel(model: unknown): string {
  const value = String(model || '').trim();
  return VIDEO_MODELS.some((item) => item.id === value) ? value : DEFAULT_VIDEO_MODEL;
}

type EditingState = {
  clipKey: string;
  segmentId: string;
  prompt: string;
  durationText: string;
};

type RemixClipItem = {
  key: string;
  clipIndex: number;
  timeRange: string;
  duration: number;
  imagePrompt: string;
  videoPrompt: string;
  segment: StoryboardSegmentItem | null;
};

function clampSeedanceDuration(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 8;
  return Math.max(MIN_SEEDANCE_DURATION, Math.min(MAX_SEEDANCE_DURATION, Math.round(value * 1000) / 1000));
}

function decodeQueryText(value: string): string {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

export default function RemixVideoGeneratePage() {
  const [taskId, setTaskId] = useState('');
  const [title, setTitle] = useState('一键复刻');
  const [task, setTask] = useState<StoryboardTaskStatusResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState('');
  const [videoModel, setVideoModel] = useState(DEFAULT_VIDEO_MODEL);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [actioningMap, setActioningMap] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const timerRef = useRef<number | null>(null);

  useLoad((query) => {
    const id = String(query?.id || '').trim();
    const incomingTitle = decodeQueryText(String(query?.title || ''));
    if (incomingTitle) setTitle(incomingTitle);
    if (!id) {
      setErrorText('缺少任务ID');
      setLoading(false);
      return;
    }
    setTaskId(id);
  });

  const clearTimer = () => {
    if (timerRef.current != null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const loadStatus = async (silent = false) => {
    if (!taskId) return;
    if (!silent) setLoading(true);
    try {
      const data = await miniappApi.getStoryboardStatus(taskId);
      setTask(data);
      if (data.videoModel) setVideoModel(normalizeVideoModel(data.videoModel));
      setErrorText('');
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '复刻视频任务加载失败');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useDidShow(() => {
    if (!taskId) return;
    void loadStatus(false);
  });

  useEffect(() => {
    if (!taskId) return undefined;
    clearTimer();
    timerRef.current = setInterval(() => {
      void loadStatus(true);
    }, POLL_INTERVAL) as unknown as number;
    return () => clearTimer();
  }, [taskId]);

  usePullDownRefresh(() => {
    void (async () => {
      await loadStatus(false);
      Taro.stopPullDownRefresh();
    })();
  });

  const segments = task?.segments || [];
  const clipItems = useMemo(() => buildRemixClipItems(task), [task]);
  const gridUrl = resolveRemixGridUrl(task);
  const generatedCount = clipItems.filter((clip) => Boolean(normalizeMediaUrl(clip.segment?.generatedVideo))).length;
  const pendingCount = Math.max(0, clipItems.length - generatedCount);
  const generatingCount = clipItems.filter((clip) => isVideoGenerating(clip.segment)).length;
  const stageItems = buildRemixStages(segments, Boolean(task?.finalVideoUrl));

  const editingClip = useMemo(
    () => clipItems.find((item) => item.key === editing?.clipKey) || null,
    [clipItems, editing?.clipKey],
  );
  const editingSegment = editingClip?.segment || segments.find((item) => item.id === editing?.segmentId) || null;

  const setActioning = (key: string, value: boolean) => {
    setActioningMap((prev) => ({ ...prev, [key]: value }));
  };

  const isActioning = (key: string) => Boolean(actioningMap[key]);

  const upsertLocalSegment = (segmentId: string, patch: Partial<StoryboardSegmentItem>) => {
    setTask((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        segments: prev.segments.map((item) => (item.id === segmentId ? { ...item, ...patch } : item)),
      };
    });
  };

  const appendLocalSegments = (newSegments: StoryboardSegmentItem[]) => {
    if (!newSegments.length) return;
    setTask((prev) => {
      if (!prev) return prev;
      const existingIds = new Set(prev.segments.map((item) => item.id));
      const merged = [
        ...prev.segments,
        ...newSegments.filter((segment) => segment.id && !existingIds.has(segment.id)),
      ].sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
      return { ...prev, segments: merged };
    });
  };

  const handleBack = () => {
    Taro.navigateBack({ delta: 1 });
  };

  const handlePreviewGrid = () => {
    if (!gridUrl) return;
    Taro.previewImage({ current: gridUrl, urls: [gridUrl] });
  };

  const handleOpenVideo = (clip: RemixClipItem) => {
    const segment = clip.segment;
    if (!segment) return;
    const videoUrl = normalizeMediaUrl(segment.generatedVideo);
    if (!videoUrl) {
      Taro.showToast({ title: '视频还未生成', icon: 'none' });
      return;
    }
    const imageUrl = normalizeMediaUrl(segment.generatedImage) || gridUrl;
    const detailItem = {
      id: `${segment.id}:remix-video`,
      title: `Clip ${clip.clipIndex}`,
      type: 'video',
      status: segment.status,
      createdAt: new Date().toISOString(),
      preview: videoUrl,
      videoUrl,
      thumbnailUrl: imageUrl || null,
      metadata: { videoUrl },
      source: 'task',
    };
    Taro.setStorageSync('WORK_DETAIL_ITEM', detailItem);
    Taro.navigateTo({
      url: `/subpages/work-detail/index?id=${encodeURIComponent(detailItem.id)}`,
    });
  };

  const persistClipToSegment = async (clip: RemixClipItem, patch?: { prompt?: string; duration?: number }) => {
    const segment = clip.segment;
    if (!segment) throw new Error('当前 Clip 缺少可生成片段');
    const prompt = (patch?.prompt ?? clip.videoPrompt).trim();
    const duration = clampSeedanceDuration(patch?.duration ?? clip.duration);
    await miniappApi.updateStoryboardSegment(segment.id, {
      videoPrompt: prompt,
      duration,
      clip_video_prompt: prompt,
      clipVideoPrompt: prompt,
      clip_index: clip.clipIndex,
      clipIndex: clip.clipIndex,
      clip_time_range: clip.timeRange,
      clipTimeRange: clip.timeRange,
    });
    const params = asRecord(segment.generationParams) || {};
    upsertLocalSegment(segment.id, {
      videoPrompt: prompt,
      duration,
      generationParams: {
        ...params,
        clip_video_prompt: prompt,
        clip_index: clip.clipIndex,
        clip_time_range: clip.timeRange,
      },
    });
  };

  const ensureClipSegment = async (clip: RemixClipItem): Promise<StoryboardSegmentItem> => {
    if (clip.segment) return clip.segment;
    const created = await miniappApi.createStoryboardSegments(
      taskId,
      [{
        videoPrompt: clip.videoPrompt,
        imagePrompt: clip.imagePrompt,
        duration: clampSeedanceDuration(clip.duration),
        timeRange: clip.timeRange,
      }],
      Math.max(0, clip.clipIndex - 1),
    );
    const segment = created[0];
    if (!segment) throw new Error('同步可生成片段失败');
    appendLocalSegments(created);
    return segment;
  };

  const handleGenerateClip = async (clip: RemixClipItem) => {
    const initialSegment = clip.segment;
    if (isVideoGenerating(initialSegment)) {
      Taro.showToast({ title: '视频生成中，请稍后查看', icon: 'none' });
      return;
    }
    const actionKey = `${initialSegment?.id || clip.key}-video`;
    if (isActioning(actionKey)) return;
    setActioning(actionKey, true);
    try {
      const segment = await ensureClipSegment(clip);
      const ensuredClip = { ...clip, segment };
      await persistClipToSegment(ensuredClip);
      upsertLocalSegment(segment.id, { generatedVideo: null, status: 'VIDEO_GENERATING' });
      const result = await miniappApi.generateStoryboardVideos({
        taskId,
        segmentIds: [segment.id],
        model: videoModel,
        allowTextVideo: true,
        source: SMART_REMIX_VIDEO_STAGE_SOURCE,
      });
      if (result.triggered <= 0) {
        throw new Error(result.message || '触发视频生成失败');
      }
      Taro.showToast({ title: '已开始生成片段', icon: 'success' });
      await loadStatus(true);
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '生成失败', icon: 'none' });
      await loadStatus(true);
    } finally {
      setActioning(actionKey, false);
    }
  };

  const handleGenerateAll = async () => {
    if (batchGenerating) return;
    if (!clipItems.length) {
      Taro.showToast({ title: '暂无视频提示词', icon: 'none' });
      return;
    }

    let targetClips = clipItems.filter(
      (clip) => clip.segment && !normalizeMediaUrl(clip.segment.generatedVideo) && !isVideoGenerating(clip.segment),
    );
    if (targetClips.length === 0) {
      if (generatingCount > 0) {
        Taro.showToast({ title: '视频生成中，请稍后查看', icon: 'none' });
        return;
      }
      const modal = await Taro.showModal({
        title: '重新生成全部视频？',
        content: '所有片段已有视频，将重新生成全部片段。',
        confirmText: '重新生成',
        cancelText: '取消',
      });
      if (!modal.confirm) return;
      targetClips = clipItems.filter((clip) => clip.segment);
    }

    const missingClips = clipItems.filter((clip) => !clip.segment);
    if (!targetClips.length && !missingClips.length) {
      Taro.showToast({ title: '当前 Clip 缺少可生成片段', icon: 'none' });
      return;
    }

    setBatchGenerating(true);
    try {
      if (missingClips.length > 0) {
        const created = await miniappApi.createStoryboardSegments(
          taskId,
          missingClips.map((clip) => ({
            videoPrompt: clip.videoPrompt,
            imagePrompt: clip.imagePrompt,
            duration: clampSeedanceDuration(clip.duration),
            timeRange: clip.timeRange,
          })),
        );
        appendLocalSegments(created);
        const createdByKey = new Map(
          created.map((segment, index) => [missingClips[index]?.key, segment] as const).filter((item) => Boolean(item[0]) && Boolean(item[1])),
        );
        targetClips = [
          ...targetClips,
          ...missingClips
            .map((clip) => {
              const segment = createdByKey.get(clip.key);
              return segment ? { ...clip, segment } : null;
            })
            .filter((clip): clip is RemixClipItem => Boolean(clip)),
        ];
      }

      const quote = await miniappApi.generateStoryboardVideos({
        taskId,
        segmentIds: targetClips.map((clip) => clip.segment?.id).filter((id): id is string => Boolean(id)),
        model: videoModel,
        allowTextVideo: true,
        quoteOnly: true,
        source: SMART_REMIX_VIDEO_STAGE_SOURCE,
      });
      const credits = quote.creditEstimate?.amount;
      const unitText = quote.creditEstimate?.billingMode === 'duration_seconds'
        ? `，计费时长 ${quote.creditEstimate.units} 秒`
        : `，计费片段 ${quote.creditEstimate?.units ?? targetClips.length} 个`;
      const confirm = await Taro.showModal({
        title: '确认消耗积分',
        content: `本次将生成 ${targetClips.length} 个片段，预计消耗 ${formatCreditAmount(credits)} 积分${unitText}。确认后开始生成。`,
        confirmText: '确认生成',
        cancelText: '取消',
      });
      if (!confirm.confirm) return;

      await Promise.all(targetClips.map((clip) => persistClipToSegment(clip)));
      targetClips.forEach((clip) => {
        if (clip.segment) upsertLocalSegment(clip.segment.id, { generatedVideo: null, status: 'VIDEO_GENERATING' });
      });
      const result = await miniappApi.generateStoryboardVideos({
        taskId,
        segmentIds: targetClips.map((clip) => clip.segment?.id).filter((id): id is string => Boolean(id)),
        model: videoModel,
        allowTextVideo: true,
        source: SMART_REMIX_VIDEO_STAGE_SOURCE,
      });
      if (result.triggered <= 0) {
        throw new Error(result.message || '触发批量生成失败');
      }
      Taro.showToast({ title: `已触发${result.triggered}个片段`, icon: 'success' });
      await loadStatus(true);
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '批量生成失败', icon: 'none' });
      await loadStatus(true);
    } finally {
      setBatchGenerating(false);
    }
  };

  const handleCancelGeneratingClip = async (clip: RemixClipItem) => {
    const segment = clip.segment;
    if (!segment) return;
    const actionKey = `${segment.id}-cancel-video`;
    if (isActioning(actionKey)) return;
    const confirm = await Taro.showModal({
      title: '取消生成？',
      content: '取消后当前片段会恢复为待生成状态，可稍后重新生成。',
      confirmText: '取消生成',
      cancelText: '继续等待',
    });
    if (!confirm.confirm) return;

    setActioning(actionKey, true);
    try {
      await miniappApi.updateStoryboardSegment(segment.id, {
        status: normalizeMediaUrl(segment.generatedImage) ? 'IMAGE_READY' : 'PENDING',
        generatedVideo: null,
        video_generation_cancelled: true,
        videoGenerationCancelled: true,
      });
      upsertLocalSegment(segment.id, {
        generatedVideo: null,
        status: normalizeMediaUrl(segment.generatedImage) ? 'IMAGE_READY' : 'PENDING',
        generationParams: {
          ...(asRecord(segment.generationParams) || {}),
          video_generation_cancelled: true,
        },
      });
      Taro.showToast({ title: '已取消生成', icon: 'success' });
      await loadStatus(true);
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '取消失败', icon: 'none' });
    } finally {
      setActioning(actionKey, false);
    }
  };

  const handleSaveEditingPrompt = async () => {
    if (!editingClip || !editingSegment || !editing) return false;
    const prompt = editing.prompt.trim();
    const nextDuration = parseDurationInput(editing.durationText, editingClip.duration);
    if (nextDuration == null) {
      Taro.showToast({ title: '请输入有效时长', icon: 'none' });
      return false;
    }
    setSavingPrompt(true);
    try {
      await persistClipToSegment(editingClip, { prompt, duration: nextDuration });
      Taro.showToast({ title: '提示词已保存', icon: 'success' });
      return true;
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '保存失败', icon: 'none' });
      return false;
    } finally {
      setSavingPrompt(false);
    }
  };

  const handleSaveAndGenerate = async () => {
    if (!editingClip) return;
    const ok = await handleSaveEditingPrompt();
    if (!ok) return;
    const nextDuration = parseDurationInput(editing?.durationText || '', editingClip.duration) ?? editingClip.duration;
    const nextClip = { ...editingClip, videoPrompt: editing?.prompt.trim() || '', duration: nextDuration };
    setEditing(null);
    await handleGenerateClip(nextClip);
  };

  const handleOpenStoryboardMerge = () => {
    if (generatedCount <= 0) {
      Taro.showToast({ title: '请先生成视频片段', icon: 'none' });
      return;
    }
    Taro.redirectTo({
      url: `/subpages/storyboard-board/index?id=${encodeURIComponent(taskId)}&title=${encodeURIComponent(title || '一键复刻')}&mode=remix-board`,
    });
  };

  return (
    <View className='remix-video-page'>
      <View className='remix-video-nav'>
        <View className='remix-video-back' onClick={handleBack}>
          <Text className='remix-video-back-text'>‹</Text>
        </View>
        <Text className='remix-video-nav-title'>生成视频</Text>
        <View className='remix-video-nav-spacer' />
      </View>

      <ScrollView scrollY className='remix-video-scroll'>
        {loading && (
          <View className='remix-video-state'>
            <View className='remix-video-spinner' />
            <Text className='remix-video-state-text'>加载中...</Text>
          </View>
        )}

        {!loading && !!errorText && (
          <View className='remix-video-state'>
            <Text className='remix-video-state-text'>{errorText}</Text>
          </View>
        )}

        {!loading && !errorText && (
          <>
            <View className='remix-video-stage-section'>
              <View className='remix-video-stage-track'>
                {stageItems.map((stage, index) => (
                  <View key={stage.key} className='remix-video-stage-item'>
                    <View className={`remix-video-stage-dot remix-video-stage-dot--${stage.state}`}>
                      <Text className='remix-video-stage-dot-text'>{index + 1}</Text>
                    </View>
                    {index < stageItems.length - 1 && <View className={`remix-video-stage-line remix-video-stage-line--${stage.state}`} />}
                    <Text className={`remix-video-stage-name remix-video-stage-name--${stage.state}`}>{stage.title}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View className='remix-video-hero'>
              <View className='remix-video-hero-head'>
                <View>
                  <Text className='remix-video-title'>{title || '一键复刻'}</Text>
                  <Text className='remix-video-subtitle'>{clipItems.length} 条视频提示词 · 已完成 {generatedCount} 条</Text>
                </View>
                <Text className='remix-video-count'>{pendingCount > 0 ? `${pendingCount}待生成` : '已生成'}</Text>
              </View>

              <View className='remix-video-grid-card' onClick={handlePreviewGrid}>
                {gridUrl ? (
                  <Image className='remix-video-grid-image' src={gridUrl} mode='aspectFit' />
                ) : (
                  <Text className='remix-video-grid-placeholder'>暂无分镜网格图</Text>
                )}
              </View>
            </View>

            <View className='remix-video-model-section'>
              <Text className='remix-video-section-title'>视频模型</Text>
              <ScrollView scrollX className='remix-video-model-scroll'>
                <View className='remix-video-model-row'>
                  {VIDEO_MODELS.map((model) => (
                    <View
                      key={model.id}
                      className={`remix-video-model-chip ${videoModel === model.id ? 'remix-video-model-chip--active' : ''}`}
                      onClick={() => setVideoModel(normalizeVideoModel(model.id))}
                    >
                      <Text className={`remix-video-model-chip-text ${videoModel === model.id ? 'remix-video-model-chip-text--active' : ''}`}>
                        {model.label}
                      </Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>

            <View className='remix-video-list-head'>
              <Text className='remix-video-section-title'>视频提示词</Text>
              <Text className='remix-video-list-note'>可单独编辑和生成</Text>
            </View>

            <View className='remix-video-list'>
              {clipItems.map((clip) => {
                const segment = clip.segment;
                const videoUrl = normalizeMediaUrl(segment?.generatedVideo);
                const generating = isVideoGenerating(segment) && !videoUrl;
                const failed = isVideoFailed(segment);
                const actioning = segment ? isActioning(`${segment.id}-video`) : false;
                const cancelling = segment ? isActioning(`${segment.id}-cancel-video`) : false;
                const disableActions = actioning || (generating && cancelling);
                return (
                  <View key={clip.key} className='remix-video-clip-card'>
                    <View className='remix-video-clip-head'>
                      <Text className='remix-video-clip-title'>Clip {clip.clipIndex}</Text>
                      <Text className={`remix-video-clip-status ${videoUrl ? 'remix-video-clip-status--done' : ''} ${failed ? 'remix-video-clip-status--failed' : ''}`}>
                        {!segment ? '待同步' : videoUrl ? '已生成' : generating || actioning ? '生成中' : failed ? '失败' : '待生成'}
                      </Text>
                    </View>
                    <Text className='remix-video-clip-meta'>时长 {formatDuration(clip.duration)}s{clip.timeRange ? ` | ${clip.timeRange}` : ''}</Text>
                    <Text className='remix-video-clip-prompt'>{clip.videoPrompt || '暂无视频提示词'}</Text>
                    {videoUrl && (
                      <View className='remix-video-preview' onClick={() => handleOpenVideo(clip)}>
                        <Video
                          className='remix-video-preview-video'
                          src={videoUrl}
                          poster={normalizeMediaUrl(segment?.generatedImage) || gridUrl}
                          controls={false}
                          muted
                          autoplay={false}
                          showCenterPlayBtn={false}
                          showFullscreenBtn={false}
                          objectFit='cover'
                        />
                        <View className='remix-video-preview-badge'>
                          <Text className='remix-video-preview-badge-text'>查看</Text>
                        </View>
                      </View>
                    )}
                    {generating && !videoUrl && (
                      <View className='remix-video-generating-card'>
                        <View className='remix-video-generating-pulse'>
                          <View className='remix-video-generating-spinner' />
                        </View>
                        <Text className='remix-video-generating-title'>视频生成中</Text>
                        <Text className='remix-video-generating-desc'>可离开当前页面，回来后会继续同步状态</Text>
                      </View>
                    )}
                    <View className='remix-video-clip-actions'>
                      <View
                        className={`remix-video-clip-btn remix-video-clip-btn--ghost ${generating ? 'remix-video-clip-btn--disabled' : ''}`}
                        onClick={() => {
                          if (generating) return;
                          setEditing({
                            clipKey: clip.key,
                            segmentId: segment?.id || '',
                            prompt: clip.videoPrompt || '',
                            durationText: formatDuration(clip.duration),
                          });
                        }}
                      >
                        <Text className='remix-video-clip-btn-text remix-video-clip-btn-text--ghost'>编辑提示词</Text>
                      </View>
                      <View
                        className={`remix-video-clip-btn remix-video-clip-btn--primary ${generating ? 'remix-video-clip-btn--danger' : ''} ${disableActions ? 'remix-video-clip-btn--disabled' : ''}`}
                        onClick={() => {
                          if (disableActions) return;
                          if (generating) {
                            void handleCancelGeneratingClip(clip);
                            return;
                          }
                          void handleGenerateClip(clip);
                        }}
                      >
                        <Text className={`remix-video-clip-btn-text ${generating ? 'remix-video-clip-btn-text--danger' : ''}`}>
                          {cancelling ? '取消中' : actioning ? '生成中' : generating ? '取消生成' : videoUrl ? '重新生成' : '生成视频'}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

      {!loading && !errorText && (
        <View className='remix-video-bottom'>
          <View
            className='remix-video-board-btn'
            onClick={handleOpenStoryboardMerge}
          >
            <Text className='remix-video-board-btn-text'>一键剪辑</Text>
          </View>
          <View
            className={`remix-video-batch-btn ${batchGenerating ? 'remix-video-batch-btn--disabled' : ''}`}
            onClick={() => void handleGenerateAll()}
          >
            <Text className='remix-video-batch-btn-text'>{batchGenerating ? '生成中...' : '一键批量生成'}</Text>
          </View>
        </View>
      )}

      {editing && editingClip && (
        <View className='remix-video-edit-mask' onClick={() => setEditing(null)}>
          <View className='remix-video-edit-panel' onClick={(event) => event.stopPropagation()}>
            <View className='remix-video-edit-head'>
              <Text className='remix-video-edit-title'>Clip {editingClip.clipIndex} · 视频提示词</Text>
              <View className='remix-video-edit-close' onClick={() => setEditing(null)}>
                <Text className='remix-video-edit-close-text'>×</Text>
              </View>
            </View>
            <View className='remix-video-edit-duration-row'>
              <Text className='remix-video-edit-duration-label'>片段时长</Text>
              <View className='remix-video-edit-duration-input-wrap'>
                <Input
                  className='remix-video-edit-duration-input'
                  type='digit'
                  value={editing.durationText}
                  onInput={(event) => setEditing({ ...editing, durationText: String(event.detail.value || '') })}
                />
                <Text className='remix-video-edit-duration-unit'>秒</Text>
              </View>
            </View>
            <Textarea
              className='remix-video-edit-textarea'
              value={editing.prompt}
              maxlength={12000}
              placeholder='请输入视频提示词'
              placeholderStyle='font-size: 26rpx; color: #7f8da8;'
              onInput={(event) => setEditing({ ...editing, prompt: event.detail.value })}
            />
            <View className='remix-video-edit-actions'>
              <View className='remix-video-edit-btn remix-video-edit-btn--ghost' onClick={() => void handleSaveEditingPrompt()}>
                <Text className='remix-video-edit-btn-text remix-video-edit-btn-text--ghost'>{savingPrompt ? '保存中' : '保存'}</Text>
              </View>
              <View className='remix-video-edit-btn remix-video-edit-btn--primary' onClick={() => void handleSaveAndGenerate()}>
                <Text className='remix-video-edit-btn-text'>保存并生成</Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

function normalizeMediaUrl(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || /^(undefined|null|nan)$/i.test(text)) return '';
  if (text.startsWith('//')) return `https:${text}`;
  return /^https?:\/\//i.test(text) ? text : '';
}

function isVideoGenerating(segment?: StoryboardSegmentItem | null): boolean {
  const statusText = String(segment?.status || '').toUpperCase();
  return statusText.includes('VIDEO_GENERATING') || statusText.includes('VIDEO_QUEUED') || statusText.includes('VIDEO_PROCESSING');
}

function isVideoFailed(segment?: StoryboardSegmentItem | null): boolean {
  const statusText = String(segment?.status || '').toUpperCase();
  return statusText.includes('VIDEO') && (statusText.includes('FAIL') || statusText.includes('ERROR'));
}

function formatCreditAmount(value: unknown): string {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return '约 0';
  if (Number.isInteger(amount)) return String(amount);
  return amount.toFixed(2).replace(/\.?0+$/, '');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function getWorkflowData(task: StoryboardTaskStatusResult | null): Record<string, unknown> {
  const detailed = asRecord(task?.detailedBreakdown);
  return asRecord(detailed?.workflow_data) || asRecord(detailed?.workflowData) || detailed || {};
}

function resolveRemixGridUrl(task: StoryboardTaskStatusResult | null): string {
  const detailed = asRecord(task?.detailedBreakdown);
  const workflowData = getWorkflowData(task);
  const replacedGrid = (task?.segments || [])
    .map((segment) => {
      const params = asRecord(segment.generationParams) || {};
      return normalizeMediaUrl(params.selected_image_url || params.selectedImageUrl || segment.generatedImage);
    })
    .find(Boolean);
  return normalizeMediaUrl(
    replacedGrid ||
      task?.storyboardImageUrl ||
      task?.coverImage ||
      detailed?.storyboard_grid_url ||
      detailed?.storyboardGridUrl ||
      workflowData.storyboard_grid_url ||
      workflowData.storyboardGridUrl ||
      '',
  );
}

function buildRemixClipItems(task: StoryboardTaskStatusResult | null): RemixClipItem[] {
  const segments = task?.segments || [];
  const workflowData = getWorkflowData(task);
  const clonePrompt = asRecord(workflowData.clone_prompt) || asRecord(workflowData.clonePrompt);
  const sourceClips = [
    ...toRecordArray(clonePrompt?.clips),
    ...toRecordArray(workflowData.clip_prompts),
    ...toRecordArray(workflowData.clipPrompts),
    ...toRecordArray(workflowData.video_prompts),
    ...toRecordArray(workflowData.videoPrompts),
    ...toRecordArray(workflowData.clips),
  ];
  const seenSourceKeys = new Set<string>();
  const promptClips = sourceClips
    .map((record, index) => {
      const rawClipIndex = Number(record.clip_index || record.clipIndex || record.index || index + 1);
      const clipIndex = Number.isFinite(rawClipIndex) && rawClipIndex > 0 ? Math.floor(rawClipIndex) : index + 1;
      const timeRange = normalizeText(String(record.time_range || record.timeRange || record.timeline || ''));
      const segment = findMatchingSegment(segments, clipIndex, timeRange, index);
      const params = asRecord(segment?.generationParams) || {};
      const savedPrompt = normalizeText(String(params.clip_video_prompt || params.clipVideoPrompt || ''));
      const videoPrompt = savedPrompt || resolveClipPrompt(record);
      const imagePrompt = normalizeText(String(record.image_prompt || record.imagePrompt || record.first_frame_prompt || ''));
      const clipDuration = resolveClipDuration(record, timeRange);
      const segmentDuration = Number(segment?.duration || 0);
      const duration = clipDuration > 0
        ? clipDuration
        : Number.isFinite(segmentDuration) && segmentDuration > 0
          ? Math.round(segmentDuration * 1000) / 1000
          : 8;
      const sourceKey = `${clipIndex}-${timeRange}-${videoPrompt.slice(0, 80)}`;
      if ((!videoPrompt && !imagePrompt) || seenSourceKeys.has(sourceKey)) return null;
      seenSourceKeys.add(sourceKey);
      return {
        key: `clip-${clipIndex}-${index}`,
        clipIndex,
        timeRange,
        duration: clampSeedanceDuration(duration),
        imagePrompt,
        videoPrompt,
        segment,
      };
    })
    .filter((item): item is RemixClipItem => Boolean(item));

  if (promptClips.length > 0) return promptClips;

  return segments
    .map((segment, index) => {
      const params = asRecord(segment.generationParams) || {};
      const clipIndex = getSegmentDisplayOrder(segment, index);
      const timeRange = normalizeText(segment.timeRange || '');
      const videoPrompt = normalizeText(String(params.clip_video_prompt || params.clipVideoPrompt || segment.videoPrompt || ''));
      const imagePrompt = normalizeText(segment.imagePrompt || '');
      if (!imagePrompt && !videoPrompt) return null;
      return {
        key: segment.id,
        clipIndex,
        timeRange,
        duration: clampSeedanceDuration(resolveClipDuration({}, timeRange) || Number(segment.duration || 0) || 8),
        imagePrompt,
        videoPrompt,
        segment,
      };
    })
    .filter((item): item is RemixClipItem => Boolean(item));
}

function resolveClipPrompt(record: Record<string, unknown>): string {
  const direct = normalizeText(String(
    record.prompt ||
      record.video_prompt ||
      record.videoPrompt ||
      record.generation_prompt ||
      record.generationPrompt ||
      '',
  ));
  if (direct) return direct;

  const sections = [
    record.clip_info_srt || record.clipInfoSrt || record.clip_info || record.clipInfo,
    record.timeline,
    record.storyboard_panels || record.storyboardPanels,
    record.matched_srt || record.matchedSrt,
    record.visual_audit || record.visualAudit,
    record.generationPrompt || record.generation_prompt,
    record.sequence_details || record.sequenceDetails,
    record.global_visual_anchor || record.globalVisualAnchor,
    record.audio_action_cues || record.audioActionCues,
  ]
    .map((value) => normalizeText(String(value || '')))
    .filter(Boolean);
  return sections.join('\n');
}

function resolveClipDuration(record: Record<string, unknown>, timeRange: string): number {
  const rawDuration = Number(
    record.duration ||
      record.duration_sec ||
      record.durationSec ||
      record.duration_seconds ||
      record.durationSeconds ||
      0,
  );
  if (Number.isFinite(rawDuration) && rawDuration > 0) return Math.round(rawDuration * 1000) / 1000;
  const fromTimeRange = durationFromTimeRange(timeRange);
  return fromTimeRange > 0 ? fromTimeRange : 8;
}

function durationFromTimeRange(value: string): number {
  const text = normalizeText(value);
  const match = text.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*[-~–—]\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return 0;
  const start = toSeconds(match[1], match[2], match[3]);
  const end = toSeconds(match[4], match[5], match[6]);
  return end > start ? Math.round((end - start) * 1000) / 1000 : 0;
}

function toSeconds(first: string, second: string, third?: string): number {
  const a = Number(first);
  const b = Number(second);
  const c = third === undefined ? 0 : Number(third);
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) return 0;
  return third === undefined ? a * 60 + b : a * 3600 + b * 60 + c;
}

function findMatchingSegment(
  segments: StoryboardSegmentItem[],
  clipIndex: number,
  timeRange: string,
  fallbackIndex: number,
): StoryboardSegmentItem | null {
  const byOrder = segments.find((segment, index) => getSegmentDisplayOrder(segment, index) === clipIndex);
  if (byOrder) return byOrder;
  const normalizedTimeRange = normalizeComparableText(timeRange);
  if (normalizedTimeRange) {
    const byTime = segments.find((segment) => normalizeComparableText(segment.timeRange || '') === normalizedTimeRange);
    if (byTime) return byTime;
  }
  return segments[fallbackIndex] || null;
}

function toRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item));
}

function normalizeText(value: string): string {
  return String(value || '').replace(/\r\n/g, '\n').trim();
}

function normalizeComparableText(value: string): string {
  return normalizeText(value).toLowerCase().replace(/\s+/g, ' ');
}

function getSegmentDisplayOrder(segment: StoryboardSegmentItem, index: number): number {
  const raw = Number(segment.order);
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  return index >= 0 ? index + 1 : 1;
}

function formatDuration(value: unknown): string {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return '8';
  return String(Math.round(num * 1000) / 1000).replace(/\.0+$/, '');
}

function parseDurationInput(value: string, fallback: number): number | null {
  const text = String(value || '').trim();
  const num = text ? Number(text) : Number(fallback);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.max(1, Math.min(60, Math.round(num * 1000) / 1000));
}

function buildRemixStages(
  segments: StoryboardSegmentItem[],
  hasFinalVideo: boolean,
): Array<{ key: string; title: string; state: 'done' | 'active' | 'todo' }> {
  const hasSegments = segments.length > 0;
  const hasGeneratedVideos = segments.some((segment) => Boolean(normalizeMediaUrl(segment.generatedVideo)));
  return [
    { key: 'breakdown', title: '爆款拆解', state: hasSegments ? 'done' : 'active' },
    { key: 'replace', title: '产品/角色替换', state: hasSegments ? 'done' : 'todo' },
    {
      key: 'video',
      title: '视频生成',
      state: hasFinalVideo || hasGeneratedVideos ? 'done' : hasSegments ? 'active' : 'todo',
    },
  ];
}
