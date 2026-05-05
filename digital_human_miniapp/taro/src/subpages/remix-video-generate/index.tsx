import { View, Text, ScrollView, Image, Video, Textarea } from '@tarojs/components';
import Taro, { useDidShow, useLoad, usePullDownRefresh } from '@tarojs/taro';
import { useEffect, useMemo, useRef, useState } from 'react';
import { miniappApi } from '../../utils/miniapp-api';
import type { StoryboardSegmentItem, StoryboardTaskStatusResult } from '../../utils/miniapp-api';
import './index.sass';

const POLL_INTERVAL = 4000;

const VIDEO_MODELS = [
  { id: 'bytedance/seedance-2', label: 'Seedance 2.0' },
  { id: 'bytedance/seedance-2-fast', label: 'Seedance Fast' },
  { id: 'veo3.1-fast', label: 'Veo 3.1 Fast' },
  { id: 'veo_3_1-fast', label: 'Veo 兼容' },
];

type EditingState = {
  segmentId: string;
  prompt: string;
};

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
  const [videoModel, setVideoModel] = useState('bytedance/seedance-2');
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
      if (data.videoModel) setVideoModel(data.videoModel);
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
  const gridUrl = resolveRemixGridUrl(task);
  const generatedCount = segments.filter((segment) => Boolean(normalizeMediaUrl(segment.generatedVideo))).length;
  const pendingCount = Math.max(0, segments.length - generatedCount);

  const editingSegment = useMemo(
    () => segments.find((item) => item.id === editing?.segmentId) || null,
    [segments, editing?.segmentId],
  );

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

  const handleBack = () => {
    Taro.navigateBack({ delta: 1 });
  };

  const handlePreviewGrid = () => {
    if (!gridUrl) return;
    Taro.previewImage({ current: gridUrl, urls: [gridUrl] });
  };

  const handleOpenVideo = (segment: StoryboardSegmentItem) => {
    const videoUrl = normalizeMediaUrl(segment.generatedVideo);
    if (!videoUrl) {
      Taro.showToast({ title: '视频还未生成', icon: 'none' });
      return;
    }
    const imageUrl = normalizeMediaUrl(segment.generatedImage) || gridUrl;
    Taro.navigateTo({
      url: `/subpages/work-detail/index?id=${encodeURIComponent(`${segment.id}:remix-video`)}`,
      success: () => {
        Taro.setStorageSync('WORK_DETAIL_ITEM', {
          id: `${segment.id}:remix-video`,
          title: `片段 ${getSegmentDisplayOrder(segment, segments.findIndex((item) => item.id === segment.id))}`,
          type: 'video',
          status: segment.status,
          createdAt: new Date().toISOString(),
          preview: videoUrl,
          videoUrl,
          thumbnailUrl: imageUrl || null,
          metadata: { videoUrl },
          source: 'task',
        });
      },
    });
  };

  const handleGenerateSegment = async (segment: StoryboardSegmentItem) => {
    const actionKey = `${segment.id}-video`;
    if (isActioning(actionKey)) return;
    setActioning(actionKey, true);
    try {
      upsertLocalSegment(segment.id, { generatedVideo: null, status: 'VIDEO_GENERATING' });
      const result = await miniappApi.generateStoryboardVideos({
        taskId,
        segmentIds: [segment.id],
        model: videoModel,
        allowTextVideo: true,
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
    if (!segments.length) {
      Taro.showToast({ title: '暂无视频提示词', icon: 'none' });
      return;
    }

    let targetSegments = segments.filter((segment) => !normalizeMediaUrl(segment.generatedVideo));
    if (targetSegments.length === 0) {
      const modal = await Taro.showModal({
        title: '重新生成全部视频？',
        content: '所有片段已有视频，将重新生成全部片段。',
        confirmText: '重新生成',
        cancelText: '取消',
      });
      if (!modal.confirm) return;
      targetSegments = segments;
    }

    setBatchGenerating(true);
    try {
      targetSegments.forEach((segment) => upsertLocalSegment(segment.id, { generatedVideo: null, status: 'VIDEO_GENERATING' }));
      const result = await miniappApi.generateStoryboardVideos({
        taskId,
        segmentIds: targetSegments.map((segment) => segment.id),
        model: videoModel,
        allowTextVideo: true,
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

  const handleSaveEditingPrompt = async () => {
    if (!editingSegment || !editing) return false;
    const prompt = editing.prompt.trim();
    setSavingPrompt(true);
    try {
      await miniappApi.updateStoryboardSegment(editingSegment.id, { videoPrompt: prompt });
      upsertLocalSegment(editingSegment.id, { videoPrompt: prompt });
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
    if (!editingSegment) return;
    const ok = await handleSaveEditingPrompt();
    if (!ok) return;
    const nextSegment = { ...editingSegment, videoPrompt: editing?.prompt.trim() || '' };
    setEditing(null);
    await handleGenerateSegment(nextSegment);
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
            <View className='remix-video-hero'>
              <View className='remix-video-hero-head'>
                <View>
                  <Text className='remix-video-title'>{title || '一键复刻'}</Text>
                  <Text className='remix-video-subtitle'>{segments.length} 条视频提示词 · 已完成 {generatedCount} 条</Text>
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
                      onClick={() => setVideoModel(model.id)}
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
              {segments.map((segment, index) => {
                const videoUrl = normalizeMediaUrl(segment.generatedVideo);
                const statusText = String(segment.status || '').toUpperCase();
                const generating = statusText.includes('VIDEO_GENERATING') && !videoUrl;
                const failed = statusText.includes('VIDEO') && (statusText.includes('FAIL') || statusText.includes('ERROR'));
                const actioning = isActioning(`${segment.id}-video`);
                return (
                  <View key={segment.id} className='remix-video-clip-card'>
                    <View className='remix-video-clip-head'>
                      <Text className='remix-video-clip-title'>片段 {getSegmentDisplayOrder(segment, index)}</Text>
                      <Text className={`remix-video-clip-status ${videoUrl ? 'remix-video-clip-status--done' : ''} ${failed ? 'remix-video-clip-status--failed' : ''}`}>
                        {videoUrl ? '已生成' : generating || actioning ? '生成中' : failed ? '失败' : '待生成'}
                      </Text>
                    </View>
                    <Text className='remix-video-clip-meta'>{segment.duration || 0}s {segment.timeRange ? `| ${segment.timeRange}` : ''}</Text>
                    <Text className='remix-video-clip-prompt'>{segment.videoPrompt || '暂无视频提示词'}</Text>
                    {videoUrl && (
                      <View className='remix-video-preview' onClick={() => handleOpenVideo(segment)}>
                        <Video
                          className='remix-video-preview-video'
                          src={videoUrl}
                          poster={normalizeMediaUrl(segment.generatedImage) || gridUrl}
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
                    <View className='remix-video-clip-actions'>
                      <View
                        className='remix-video-clip-btn remix-video-clip-btn--ghost'
                        onClick={() => setEditing({ segmentId: segment.id, prompt: segment.videoPrompt || '' })}
                      >
                        <Text className='remix-video-clip-btn-text remix-video-clip-btn-text--ghost'>编辑提示词</Text>
                      </View>
                      <View
                        className={`remix-video-clip-btn remix-video-clip-btn--primary ${actioning ? 'remix-video-clip-btn--disabled' : ''}`}
                        onClick={() => void handleGenerateSegment(segment)}
                      >
                        <Text className='remix-video-clip-btn-text'>{actioning || generating ? '生成中' : videoUrl ? '重新生成' : '生成视频'}</Text>
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
            className={`remix-video-batch-btn ${batchGenerating ? 'remix-video-batch-btn--disabled' : ''}`}
            onClick={() => void handleGenerateAll()}
          >
            <Text className='remix-video-batch-btn-text'>{batchGenerating ? '生成中...' : '一键批量生成'}</Text>
          </View>
        </View>
      )}

      {editing && editingSegment && (
        <View className='remix-video-edit-mask' onClick={() => setEditing(null)}>
          <View className='remix-video-edit-panel' onClick={(event) => event.stopPropagation()}>
            <View className='remix-video-edit-head'>
              <Text className='remix-video-edit-title'>片段 {getSegmentDisplayOrder(editingSegment, segments.findIndex((item) => item.id === editingSegment.id))} · 视频提示词</Text>
              <View className='remix-video-edit-close' onClick={() => setEditing(null)}>
                <Text className='remix-video-edit-close-text'>×</Text>
              </View>
            </View>
            <Textarea
              className='remix-video-edit-textarea'
              value={editing.prompt}
              maxlength={3000}
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
    .map((segment) => normalizeMediaUrl(segment.generatedImage))
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

function getSegmentDisplayOrder(segment: StoryboardSegmentItem, index: number): number {
  const raw = Number(segment.order);
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  return index >= 0 ? index + 1 : 1;
}
