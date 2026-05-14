import { View, Text, ScrollView, Video } from '@tarojs/components';
import Taro, { useDidShow, useLoad, usePullDownRefresh } from '@tarojs/taro';
import { useMemo, useState } from 'react';
import { miniappApi } from '../../utils/miniapp-api';
import type { StoryboardSegmentItem, StoryboardTaskStatusResult } from '../../utils/miniapp-api';
import { useMiniappShare } from '../../utils/miniapp-share';
import './index.sass';

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
  useMiniappShare({
    title: '小蚁AI智能复刻 - 生成同款视频片段',
    path: '/subpages/remix-video-generate/index',
  });

  const [taskId, setTaskId] = useState('');
  const [title, setTitle] = useState('一键复刻');
  const [task, setTask] = useState<StoryboardTaskStatusResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState('');
  const [videoModel, setVideoModel] = useState(DEFAULT_VIDEO_MODEL);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [actioningMap, setActioningMap] = useState<Record<string, boolean>>({});
  const [expandedPromptMap, setExpandedPromptMap] = useState<Record<string, boolean>>({});

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

  usePullDownRefresh(() => {
    void (async () => {
      await loadStatus(false);
      Taro.stopPullDownRefresh();
    })();
  });

  const segments = task?.segments || [];
  const clipItems = useMemo(() => buildRemixClipItems(task), [task]);
  const generatedCount = clipItems.filter((clip) => Boolean(normalizeMediaUrl(clip.segment?.generatedVideo))).length;
  const generatingCount = clipItems.filter((clip) => isVideoGenerating(clip.segment)).length;
  const stageItems = buildRemixStages(segments, Boolean(task?.finalVideoUrl));

  const setActioning = (key: string, value: boolean) => {
    setActioningMap((prev) => ({ ...prev, [key]: value }));
  };

  const isActioning = (key: string) => Boolean(actioningMap[key]);

  const togglePromptExpanded = (key: string) => {
    setExpandedPromptMap((prev) => ({ ...prev, [key]: !prev[key] }));
  };

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
    Taro.switchTab({
      url: '/pages/works/index',
      fail: () => Taro.reLaunch({ url: '/pages/works/index' }),
    });
  };

  const handleTapStage = (stageKey: string) => {
    const common = `id=${encodeURIComponent(taskId)}&title=${encodeURIComponent(title || '一键复刻')}`;
    if (stageKey === 'video') return;
    if (stageKey === 'breakdown') {
      Taro.redirectTo({
        url: `/subpages/storyboard-board/index?${common}&mode=remix-review&stage=breakdown`,
      });
      return;
    }
    if (stageKey === 'replace') {
      Taro.redirectTo({
        url: `/subpages/storyboard-board/index?${common}&mode=remix-board&stage=replace`,
      });
    }
  };

  const handleOpenVideo = (clip: RemixClipItem) => {
    const segment = clip.segment;
    if (!segment) return;
    const videoUrl = normalizeMediaUrl(segment.generatedVideo);
    if (!videoUrl) {
      Taro.showToast({ title: '视频还未生成', icon: 'none' });
      return;
    }
    Taro.setStorageSync('REMIX_VIDEO_DETAIL_ITEM', {
      taskId,
      title,
      videoModel,
      aspectRatio: resolveTaskAspectRatio(task),
      clip: {
        ...clip,
        videoUrl,
        segment,
      },
    });
    Taro.navigateTo({
      url: `/subpages/remix-video-detail/index?taskId=${encodeURIComponent(taskId)}&segmentId=${encodeURIComponent(segment.id)}&title=${encodeURIComponent(title || '一键复刻')}`,
    });
  };

  const handleOpenClipDetail = async (clip: RemixClipItem) => {
    const actionKey = `${clip.segment?.id || clip.key}-detail`;
    if (isActioning(actionKey)) return;
    setActioning(actionKey, true);
    try {
      const segment = await ensureClipSegment(clip);
      const ensuredClip = { ...clip, segment };
      await persistClipToSegment(ensuredClip);
      const videoUrl = normalizeMediaUrl(segment.generatedVideo);
      Taro.setStorageSync('REMIX_VIDEO_DETAIL_ITEM', {
        taskId,
        title,
        videoModel,
        aspectRatio: resolveTaskAspectRatio(task),
        clip: {
          ...ensuredClip,
          videoUrl,
          segment: {
            ...segment,
            videoPrompt: ensuredClip.videoPrompt,
            duration: clampSeedanceDuration(ensuredClip.duration),
          },
        },
      });
      Taro.navigateTo({
        url: `/subpages/remix-video-detail/index?taskId=${encodeURIComponent(taskId)}&segmentId=${encodeURIComponent(segment.id)}&title=${encodeURIComponent(title || '一键复刻')}`,
      });
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '打开视频编辑失败', icon: 'none' });
      await loadStatus(true);
    } finally {
      setActioning(actionKey, false);
    }
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
    const actionKey = `${clip.segment?.id || clip.key}-video`;
    if (isActioning(actionKey) || isVideoGenerating(clip.segment)) return;
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
                  <View key={stage.key} className={`remix-video-stage-item ${stage.key === 'video' ? 'remix-video-stage-item--selected' : ''}`} onClick={() => handleTapStage(stage.key)}>
                    <View className={`remix-video-stage-dot remix-video-stage-dot--${stage.state} ${stage.key === 'video' ? 'remix-video-stage-dot--selected' : ''}`}>
                      <Text className='remix-video-stage-dot-text'>{index + 1}</Text>
                    </View>
                    {index < stageItems.length - 1 && <View className={`remix-video-stage-line remix-video-stage-line--${stage.state}`} />}
                    <Text className={`remix-video-stage-name remix-video-stage-name--${stage.state} ${stage.key === 'video' ? 'remix-video-stage-name--selected' : ''}`}>{stage.title}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View className='remix-video-hero'>
              <View className='remix-video-hero-head'>
                <View>
                  <Text className='remix-video-title'>{title || '一键复刻'}</Text>
                  <Text className='remix-video-subtitle'>{clipItems.length} 个视频片段 · 已完成 {generatedCount} 个</Text>
                </View>
                <Text className='remix-video-count'>{generatingCount > 0 ? `${generatingCount}生成中` : generatedCount > 0 ? '可查看详情' : '待生成'}</Text>
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

            <View className='remix-video-list'>
              {clipItems.map((clip) => {
                const segment = clip.segment;
                const videoUrl = normalizeMediaUrl(segment?.generatedVideo);
                const generating = isVideoGenerating(segment) && !videoUrl;
                const failed = isVideoFailed(segment);
                const actionKey = `${segment?.id || clip.key}-video`;
                const detailActionKey = `${segment?.id || clip.key}-detail`;
                const actioning = isActioning(actionKey);
                const openingDetail = isActioning(detailActionKey);
                const promptExpanded = Boolean(expandedPromptMap[clip.key]);
                const promptText = clip.videoPrompt || '暂无视频提示词';
                const canGenerate = !videoUrl && !generating && !actioning;
                return (
                  <View key={clip.key} className='remix-video-clip-card'>
                    <View className='remix-video-clip-head'>
                      <Text className='remix-video-clip-title'>Clip {clip.clipIndex}</Text>
                      <Text className={`remix-video-clip-status ${videoUrl ? 'remix-video-clip-status--done' : ''} ${failed ? 'remix-video-clip-status--failed' : ''}`}>
                        {!segment ? '待同步' : videoUrl ? '已生成' : generating ? '生成中' : failed ? '失败' : '待生成'}
                      </Text>
                    </View>
                    <Text className='remix-video-clip-meta'>时长 {formatDuration(clip.duration)}s{clip.timeRange ? ` | ${clip.timeRange}` : ''}</Text>
                    <Text
                      className={`remix-video-clip-prompt ${promptExpanded ? 'remix-video-clip-prompt--expanded' : ''}`}
                      onClick={() => togglePromptExpanded(clip.key)}
                    >
                      {promptText}
                    </Text>
                    <View
                      className='remix-video-prompt-toggle'
                      onClick={() => togglePromptExpanded(clip.key)}
                    >
                      <Text className='remix-video-prompt-toggle-text' onClick={() => togglePromptExpanded(clip.key)}>
                        {promptExpanded ? '收起' : '展开'}
                      </Text>
                    </View>
                    {videoUrl && (
                      <View className={`remix-video-preview ${getVideoAspectClass(task, segment)}`} onClick={() => handleOpenVideo(clip)}>
                        <Video
                          className='remix-video-preview-video'
                          src={videoUrl}
                          controls={false}
                          muted
                          autoplay={false}
                          showCenterPlayBtn={false}
                          showFullscreenBtn={false}
                          objectFit='contain'
                        />
                      </View>
                    )}
                    {generating && !videoUrl && (
                      <View
                        className={`remix-video-generating-card ${getVideoAspectClass(task, segment)}`}
                        onClick={() => void handleOpenClipDetail(clip)}
                      >
                        <View className='remix-video-generating-pulse'>
                          <View className='remix-video-generating-spinner' />
                        </View>
                        <Text className='remix-video-generating-title'>视频生成中</Text>
                        <Text className='remix-video-generating-desc'>可以先切出页面，稍后回来查看</Text>
                      </View>
                    )}
                    {!videoUrl && !generating && (
                      <>
                        <View
                          className={`remix-video-empty-card ${getVideoAspectClass(task, segment)}`}
                          onClick={() => void handleOpenClipDetail(clip)}
                        >
                          <Text className='remix-video-empty-title'>
                            {openingDetail ? '打开中...' : failed ? '视频生成失败' : '待生成视频'}
                          </Text>
                          <Text className='remix-video-empty-desc'>点击编辑提示词和参考图</Text>
                        </View>
                        <View
                          className={`remix-video-generate-btn ${canGenerate ? '' : 'remix-video-generate-btn--disabled'}`}
                          onClick={() => {
                            if (canGenerate) void handleGenerateClip(clip);
                          }}
                        >
                          <Text className='remix-video-generate-btn-text'>{actioning ? '生成中...' : '生成视频'}</Text>
                        </View>
                      </>
                    )}
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

function normalizeAspectRatio(value: unknown): '9:16' | '16:9' | '' {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw === '9:16' || raw === '9/16' || raw === 'portrait' || raw === 'vertical' || raw === '竖屏' || raw === '竖版') return '9:16';
  if (raw === '16:9' || raw === '16/9' || raw === 'landscape' || raw === 'horizontal' || raw === '横屏' || raw === '横版') return '16:9';
  return '';
}

function resolveTaskAspectRatio(task: StoryboardTaskStatusResult | null): '9:16' | '16:9' {
  const detailed = asRecord(task?.detailedBreakdown);
  const workflowData = getWorkflowData(task);
  const candidates = [
    detailed?.aspect_ratio,
    detailed?.aspectRatio,
    workflowData.aspect_ratio,
    workflowData.aspectRatio,
    asRecord(workflowData.source_video_analysis)?.aspect_ratio,
    asRecord(workflowData.sourceVideoAnalysis)?.aspectRatio,
  ];
  for (const value of candidates) {
    const normalized = normalizeAspectRatio(value);
    if (normalized) return normalized;
  }
  return '9:16';
}

function getVideoAspectClass(task: StoryboardTaskStatusResult | null, segment?: StoryboardSegmentItem | null): string {
  const params = asRecord(segment?.generationParams) || {};
  const ratio = normalizeAspectRatio(params.aspect_ratio || params.aspectRatio) || resolveTaskAspectRatio(task);
  return ratio === '16:9' ? 'remix-video-preview--landscape' : 'remix-video-preview--portrait';
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
