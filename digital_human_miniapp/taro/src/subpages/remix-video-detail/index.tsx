import { View, Text, ScrollView, Video, Textarea, Image, Slider } from '@tarojs/components';
import Taro, { useDidShow, useLoad, usePullDownRefresh } from '@tarojs/taro';
import { useMemo, useState } from 'react';
import { miniappApi } from '../../utils/miniapp-api';
import { api } from '../../utils/api';
import type { StoryboardSegmentItem, StoryboardTaskStatusResult } from '../../utils/miniapp-api';
import './index.sass';

const VIDEO_MODELS = [
  { id: 'bytedance/seedance-2', label: 'Seedance 2.0' },
  { id: 'bytedance/seedance-2-fast', label: 'Seedance 2.0 Fast' },
];
const ASPECT_RATIO_OPTIONS = [
  { id: '9:16', label: '竖屏', hint: '9:16', icon: '▯' },
  { id: '16:9', label: '横屏', hint: '16:9', icon: '▭' },
] as const;
const DEFAULT_VIDEO_MODEL = 'bytedance/seedance-2';
const SMART_REMIX_VIDEO_STAGE_SOURCE = 'smart_remix_video_stage';
const MIN_SEEDANCE_DURATION = 4;
const MAX_SEEDANCE_DURATION = 15;
const DETAIL_STORAGE_KEY = 'REMIX_VIDEO_DETAIL_ITEM';
type DetailAspectRatio = typeof ASPECT_RATIO_OPTIONS[number]['id'];
type VideoAssetItem = {
  id: string;
  url: string;
  kind: 'asset' | 'generating';
  label?: string;
};

type DetailCache = {
  taskId?: string;
  title?: string;
  videoModel?: string;
  aspectRatio?: string;
  clip?: {
    clipIndex?: number;
    timeRange?: string;
    duration?: number;
    videoPrompt?: string;
    imagePrompt?: string;
    videoUrl?: string;
    segment?: StoryboardSegmentItem;
  };
};

function normalizeVideoModel(model: unknown): string {
  const value = String(model || '').trim();
  return VIDEO_MODELS.some((item) => item.id === value) ? value : DEFAULT_VIDEO_MODEL;
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

export default function RemixVideoDetailPage() {
  const [taskId, setTaskId] = useState('');
  const [segmentId, setSegmentId] = useState('');
  const [title, setTitle] = useState('视频详情');
  const [task, setTask] = useState<StoryboardTaskStatusResult | null>(null);
  const [segment, setSegment] = useState<StoryboardSegmentItem | null>(null);
  const [clipIndex, setClipIndex] = useState(1);
  const [timeRange, setTimeRange] = useState('');
  const [prompt, setPrompt] = useState('');
  const [durationText, setDurationText] = useState('8');
  const [videoModel, setVideoModel] = useState(DEFAULT_VIDEO_MODEL);
  const [aspectRatio, setAspectRatio] = useState<DetailAspectRatio>('9:16');
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  useLoad((query) => {
    const cached = normalizeDetailCache(Taro.getStorageSync(DETAIL_STORAGE_KEY));
    const qTaskId = String(query?.taskId || cached?.taskId || '').trim();
    const qSegmentId = String(query?.segmentId || cached?.clip?.segment?.id || '').trim();
    const incomingTitle = decodeQueryText(String(query?.title || cached?.title || ''));
    if (incomingTitle) setTitle(incomingTitle);
    if (cached?.videoModel) setVideoModel(normalizeVideoModel(cached.videoModel));
    if (cached?.clip) {
      const clip = cached.clip;
      setClipIndex(Number(clip.clipIndex || 1) || 1);
      setTimeRange(String(clip.timeRange || ''));
      setPrompt(String(clip.videoPrompt || clip.segment?.videoPrompt || ''));
      setDurationText(formatDuration(clip.duration || clip.segment?.duration || 8));
      setAspectRatio(normalizeAspectRatio(cached.aspectRatio) || resolveSegmentAspectRatio(null, clip.segment || null));
      if (clip.segment) {
        setSegment(clip.segment);
        setReferenceImages(getEditableReferenceImages(clip.segment));
      }
    }
    if (!qTaskId || !qSegmentId) {
      setErrorText('缺少视频片段信息');
      setLoading(false);
      return;
    }
    setTaskId(qTaskId);
    setSegmentId(qSegmentId);
  });

  const loadStatus = async (silent = false) => {
    if (!taskId || !segmentId) return;
    if (!silent) setLoading(true);
    try {
      const data = await miniappApi.getStoryboardStatus(taskId);
      const nextSegment = data.segments.find((item) => item.id === segmentId) || null;
      if (!nextSegment) throw new Error('未找到视频片段');
      setTask(data);
      setSegment(nextSegment);
      setVideoModel(normalizeVideoModel(data.videoModel || videoModel));
      setReferenceImages(getEditableReferenceImages(nextSegment));
      const params = asRecord(nextSegment.generationParams) || {};
      const savedPrompt = String(params.clip_video_prompt || params.clipVideoPrompt || nextSegment.videoPrompt || '').trim();
      setPrompt(savedPrompt);
      setDurationText(formatDuration(nextSegment.duration || 8));
      setClipIndex(resolveClipIndex(nextSegment, data.segments));
      setTimeRange(String(params.clip_time_range || params.clipTimeRange || nextSegment.timeRange || ''));
      setAspectRatio(resolveSegmentAspectRatio(data, nextSegment));
      setErrorText('');
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '视频详情加载失败');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useDidShow(() => {
    if (!taskId || !segmentId) return;
    void loadStatus(false);
  });

  usePullDownRefresh(() => {
    void (async () => {
      await loadStatus(false);
      Taro.stopPullDownRefresh();
    })();
  });

  const videoUrl = getSelectedVideoUrl(segment);
  const videoAssets = useMemo(() => getVideoAssetItems(segment, generating), [segment, generating]);
  const isProcessing = isVideoGenerating(segment) || generating;
  const settingsSummary = `${getModelLabel(VIDEO_MODELS, videoModel)} · ${formatDuration(durationText)}s · ${aspectRatio}`;

  const handleBack = () => {
    Taro.navigateBack({ delta: 1 });
  };

  const persistConfig = async () => {
    if (!segment) throw new Error('缺少视频片段');
    const nextPrompt = prompt.trim();
    if (!nextPrompt) throw new Error('请输入视频提示词');
    const nextDuration = parseDurationInput(durationText);
    if (nextDuration == null) throw new Error('请输入 4-15 秒之间的时长');
    const params = asRecord(segment.generationParams) || {};
    await miniappApi.updateStoryboardSegment(segment.id, {
      videoPrompt: nextPrompt,
      duration: nextDuration,
      clip_video_prompt: nextPrompt,
      clipVideoPrompt: nextPrompt,
      clip_index: clipIndex,
      clipIndex,
      clip_time_range: timeRange,
      clipTimeRange: timeRange,
      reference_image_urls: referenceImages,
      referenceImageUrls: referenceImages,
      aspect_ratio: aspectRatio,
      aspectRatio,
    });
    const nextSegment = {
      ...segment,
      videoPrompt: nextPrompt,
      duration: nextDuration,
      generationParams: {
        ...params,
        clip_video_prompt: nextPrompt,
        clip_index: clipIndex,
        clip_time_range: timeRange,
        reference_image_urls: referenceImages,
        aspect_ratio: aspectRatio,
        aspectRatio,
      },
    };
    setSegment(nextSegment);
    return nextSegment;
  };

  const handleRegenerate = async () => {
    if (!taskId || !segment || generating) return;
    setGenerating(true);
    try {
      const previousVideo = getSelectedVideoUrl(segment) || normalizeMediaUrl(segment.generatedVideo);
      const previousParams = asRecord(segment.generationParams) || {};
      const previousHistory = getVideoHistory(segment);
      const nextSegment = await persistConfig();
      const nextHistory = uniqueUrls([previousVideo, ...previousHistory]).slice(0, 20);
      await miniappApi.updateStoryboardSegment(segment.id, {
        generatedVideo: null,
        selected_video_url: null,
        status: 'VIDEO_GENERATING',
        push_video_url: true,
      });
      setSegment({
        ...nextSegment,
        generatedVideo: null,
        status: 'VIDEO_GENERATING',
        generationParams: {
          ...previousParams,
          ...asRecord(nextSegment.generationParams),
          selected_video_url: null,
          video_history: nextHistory,
        },
      });
      const result = await miniappApi.generateStoryboardVideos({
        taskId,
        segmentIds: [segment.id],
        model: videoModel,
        allowTextVideo: true,
        aspectRatio,
        source: SMART_REMIX_VIDEO_STAGE_SOURCE,
      });
      if (result.triggered <= 0) throw new Error(result.message || '触发生视频失败');
      Taro.showToast({ title: '已开始重新生成', icon: 'success' });
      await loadStatus(true);
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '重新生成失败', icon: 'none' });
      await loadStatus(true);
    } finally {
      setGenerating(false);
    }
  };

  const handleChooseImage = async () => {
    if (uploading) return;
    try {
      const choose = await Taro.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] });
      const tempPath = choose?.tempFilePaths?.[0];
      if (!tempPath) return;
      setUploading(true);
      const ext = (tempPath.split('.').pop() || 'jpg').toLowerCase();
      const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      const uploaded = await api.uploadMedia(tempPath, `remix-video-ref-${Date.now()}.${ext}`, mime);
      setReferenceImages((prev) => uniqueUrls([...prev, uploaded]).slice(0, 8));
      Taro.showToast({ title: '参考图已添加', icon: 'success' });
    } catch (error) {
      if (!isUserCancel(error)) {
        Taro.showToast({ title: error instanceof Error ? error.message : '上传失败', icon: 'none' });
      }
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveImage = (url: string) => {
    setReferenceImages((prev) => prev.filter((item) => item !== url));
  };

  const handleSelectVideoAsset = async (url: string) => {
    const assetUrl = normalizeMediaUrl(url);
    if (!segment || !assetUrl || assetUrl === videoUrl) return;
    const params = asRecord(segment.generationParams) || {};
    try {
      await miniappApi.updateStoryboardSegment(segment.id, {
        selected_video_url: assetUrl,
        status: 'VIDEO_READY',
      });
      setSegment({
        ...segment,
        status: 'VIDEO_READY',
        generationParams: {
          ...params,
          selected_video_url: assetUrl,
        },
      });
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '切换视频失败', icon: 'none' });
    }
  };

  return (
    <View className='remix-video-detail-page'>
      <View className='remix-video-detail-nav'>
        <View className='remix-video-detail-back' onClick={handleBack}>
          <Text className='remix-video-detail-back-text'>‹</Text>
        </View>
        <Text className='remix-video-detail-nav-title'>Clip {clipIndex} · 视频</Text>
        <View className='remix-video-detail-nav-spacer' />
      </View>

      <ScrollView scrollY className='remix-video-detail-scroll'>
        {loading && (
          <View className='remix-video-detail-state'>
            <View className='remix-video-detail-spinner' />
            <Text className='remix-video-detail-state-text'>加载中...</Text>
          </View>
        )}

        {!loading && !!errorText && (
          <View className='remix-video-detail-state'>
            <Text className='remix-video-detail-state-text'>{errorText}</Text>
          </View>
        )}

        {!loading && !errorText && (
          <>
            <View className='remix-video-detail-player'>
              {videoUrl ? (
                <Video
                  className='remix-video-detail-video'
                  src={videoUrl}
                  controls
                  autoplay={false}
                  muted={false}
                  showMuteBtn
                  showCenterPlayBtn
                  showFullscreenBtn
                  enablePlayGesture
                  objectFit='contain'
                  playBtnPosition='center'
                />
              ) : (
                <View className='remix-video-detail-placeholder'>
                  <View className='remix-video-detail-spinner' />
                  <Text className='remix-video-detail-placeholder-text'>{isProcessing ? '视频生成中' : '暂无视频'}</Text>
                  {isProcessing && <Text className='remix-video-detail-placeholder-desc'>可以先切出页面，稍后回来查看</Text>}
                </View>
              )}
            </View>

            <View className='remix-video-detail-assets-section'>
              <ScrollView scrollX className='remix-video-detail-assets-scroll'>
                <View className='remix-video-detail-assets-row'>
                  {videoAssets.map((asset) => {
                    const active = asset.kind === 'asset' && asset.url === videoUrl;
                    return (
                      <View
                        key={asset.id}
                        className={`remix-video-detail-asset-item ${active ? 'remix-video-detail-asset-item--active' : ''} ${asset.kind === 'generating' ? 'remix-video-detail-asset-item--generating' : ''}`}
                        onClick={() => {
                          if (asset.kind === 'asset') void handleSelectVideoAsset(asset.url);
                        }}
                      >
                        {asset.kind === 'generating' ? (
                          <>
                            <View className='remix-video-detail-asset-spinner' />
                            <Text className='remix-video-detail-asset-generating-text'>{asset.label || '生成中'}</Text>
                          </>
                        ) : (
                          <>
                            <Video
                              className='remix-video-detail-asset-video'
                              src={asset.url}
                              controls={false}
                              muted
                              autoplay={false}
                              showCenterPlayBtn={false}
                              showFullscreenBtn={false}
                              objectFit='cover'
                            />
                            <View className='remix-video-detail-asset-badge'>
                              <Text className='remix-video-detail-asset-badge-text'>视频</Text>
                            </View>
                          </>
                        )}
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          </>
        )}
      </ScrollView>

      {!loading && !errorText && (
        <View className='remix-video-detail-composer'>
          <View className='remix-video-detail-input-card'>
            <View className='remix-video-detail-ref-row'>
              <View className='remix-video-detail-ref-add' onClick={() => void handleChooseImage()}>
                <Text className='remix-video-detail-ref-add-text'>{uploading ? '...' : '+'}</Text>
              </View>
              {referenceImages.map((url) => (
                <View key={url} className='remix-video-detail-ref-item'>
                  <Image className='remix-video-detail-ref-image' src={url} mode='aspectFill' />
                  <View className='remix-video-detail-ref-remove' onClick={() => handleRemoveImage(url)}>
                    <Text className='remix-video-detail-ref-remove-text'>×</Text>
                  </View>
                </View>
              ))}
            </View>

            <Textarea
              className='remix-video-detail-textarea'
              value={prompt}
              maxlength={12000}
              placeholder='请输入提示词'
              placeholderStyle='font-size: 28rpx; color: #7f8da8;'
              fixed
              adjustPosition={false}
              cursorSpacing={20}
              onInput={(event) => setPrompt(event.detail.value)}
            />

            <View className='remix-video-detail-tool-row'>
              <View className='remix-video-detail-model-mini' onClick={() => setSettingsOpen(true)}>
                <Text className='remix-video-detail-model-mini-value'>{settingsSummary}</Text>
                <Text className='remix-video-detail-model-mini-arrow'>▾</Text>
              </View>
              <View
                className={`remix-video-detail-submit ${generating ? 'remix-video-detail-action--disabled' : ''}`}
                onClick={() => void handleRegenerate()}
              >
                <Text className='remix-video-detail-submit-text'>{generating ? '...' : '↑'}</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {settingsOpen && (
        <View className='remix-video-detail-sheet-mask' onClick={() => setSettingsOpen(false)}>
          <View className='remix-video-detail-sheet' onClick={(event) => event.stopPropagation()}>
            <Text className='remix-video-detail-sheet-title'>生成设置</Text>
            <Text className='remix-video-detail-sheet-label'>模型</Text>
            <View className='remix-video-detail-sheet-tabs'>
              {VIDEO_MODELS.map((model) => (
                <View
                  key={model.id}
                  className={`remix-video-detail-sheet-tab ${videoModel === model.id ? 'remix-video-detail-sheet-tab--active' : ''}`}
                  onClick={() => setVideoModel(normalizeVideoModel(model.id))}
                >
                  <Text className={`remix-video-detail-sheet-tab-text ${videoModel === model.id ? 'remix-video-detail-sheet-tab-text--active' : ''}`}>{model.label}</Text>
                </View>
              ))}
            </View>

            <View className='remix-video-detail-sheet-label-row'>
              <Text className='remix-video-detail-sheet-label'>时长</Text>
              <Text className='remix-video-detail-sheet-value'>{formatDuration(durationText)}s</Text>
            </View>
            <View className='remix-video-detail-slider-card'>
              <Slider
                className='remix-video-detail-slider'
                min={MIN_SEEDANCE_DURATION}
                max={MAX_SEEDANCE_DURATION}
                step={1}
                value={parseDurationInput(durationText) || 8}
                activeColor='#ecee9f'
                backgroundColor='rgba(142, 162, 200, 0.28)'
                blockColor='#ecee9f'
                blockSize={22}
                onChanging={(event) => setDurationText(String(event.detail.value))}
                onChange={(event) => setDurationText(String(event.detail.value))}
              />
              <View className='remix-video-detail-slider-scale'>
                <Text className='remix-video-detail-slider-scale-text'>{MIN_SEEDANCE_DURATION}s</Text>
                <Text className='remix-video-detail-slider-scale-text'>{MAX_SEEDANCE_DURATION}s</Text>
              </View>
            </View>

            <Text className='remix-video-detail-sheet-label'>比例</Text>
            <View className='remix-video-detail-sheet-tabs'>
              {ASPECT_RATIO_OPTIONS.map((option) => (
                <View
                  key={option.id}
                  className={`remix-video-detail-sheet-tab ${aspectRatio === option.id ? 'remix-video-detail-sheet-tab--active' : ''}`}
                  onClick={() => setAspectRatio(option.id)}
                >
                  <Text className={`remix-video-detail-sheet-ratio-icon ${aspectRatio === option.id ? 'remix-video-detail-sheet-ratio-icon--active' : ''}`}>{option.icon}</Text>
                  <View className='remix-video-detail-sheet-ratio-copy'>
                    <Text className={`remix-video-detail-sheet-tab-text ${aspectRatio === option.id ? 'remix-video-detail-sheet-tab-text--active' : ''}`}>{option.label}</Text>
                    <Text className={`remix-video-detail-sheet-tab-hint ${aspectRatio === option.id ? 'remix-video-detail-sheet-tab-hint--active' : ''}`}>{option.hint}</Text>
                  </View>
                </View>
              ))}
            </View>

            <View className='remix-video-detail-sheet-confirm' onClick={() => setSettingsOpen(false)}>
              <Text className='remix-video-detail-sheet-confirm-text'>完成</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

function normalizeDetailCache(value: unknown): DetailCache | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as DetailCache;
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

function normalizeAspectRatio(value: unknown): '9:16' | '16:9' | '' {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw === '9:16' || raw === '9/16' || raw === 'portrait' || raw === 'vertical' || raw === '竖屏' || raw === '竖版') return '9:16';
  if (raw === '16:9' || raw === '16/9' || raw === 'landscape' || raw === 'horizontal' || raw === '横屏' || raw === '横版') return '16:9';
  return '';
}

function resolveSegmentAspectRatio(task: StoryboardTaskStatusResult | null, segment: StoryboardSegmentItem | null): '9:16' | '16:9' {
  const params = asRecord(segment?.generationParams) || {};
  const workflowData = getWorkflowData(task);
  const detailed = asRecord(task?.detailedBreakdown);
  const candidates = [
    params.aspect_ratio,
    params.aspectRatio,
    detailed?.aspect_ratio,
    detailed?.aspectRatio,
    workflowData.aspect_ratio,
    workflowData.aspectRatio,
    asRecord(workflowData.source_video_analysis)?.aspect_ratio,
    asRecord(workflowData.sourceVideoAnalysis)?.aspectRatio,
  ];
  for (const value of candidates) {
    const ratio = normalizeAspectRatio(value);
    if (ratio) return ratio;
  }
  return '9:16';
}

function isVideoGenerating(segment?: StoryboardSegmentItem | null): boolean {
  const status = String(segment?.status || '').toUpperCase();
  return status.includes('VIDEO_GENERATING') || status.includes('VIDEO_QUEUED') || status.includes('VIDEO_PROCESSING');
}

function getStoredReferenceImages(segment: StoryboardSegmentItem | null): string[] {
  const params = asRecord(segment?.generationParams) || {};
  const raw = Array.isArray(params.reference_image_urls)
    ? params.reference_image_urls
    : Array.isArray(params.referenceImageUrls)
      ? params.referenceImageUrls
      : [];
  return uniqueUrls(raw.map((item) => normalizeMediaUrl(item)));
}

function getEditableReferenceImages(segment: StoryboardSegmentItem | null): string[] {
  const stored = getStoredReferenceImages(segment);
  if (stored.length > 0) return stored;
  return uniqueUrls([
    normalizeMediaUrl(asRecord(segment?.generationParams)?.selected_image_url),
    normalizeMediaUrl(asRecord(segment?.generationParams)?.selectedImageUrl),
    normalizeMediaUrl(segment?.generatedImage),
    normalizeMediaUrl(asRecord(segment?.generationParams)?.reference_frame_url),
  ]);
}

function getVideoHistory(segment: StoryboardSegmentItem | null): string[] {
  const params = asRecord(segment?.generationParams) || {};
  const raw = Array.isArray(params.video_history)
    ? params.video_history
    : Array.isArray(params.videoHistory)
      ? params.videoHistory
      : [];
  return uniqueUrls(raw.map((item) => normalizeMediaUrl(item)));
}

function getSelectedVideoUrl(segment: StoryboardSegmentItem | null): string {
  const params = asRecord(segment?.generationParams) || {};
  return normalizeMediaUrl(params.selected_video_url || params.selectedVideoUrl) || normalizeMediaUrl(segment?.generatedVideo);
}

function getVideoAssetItems(segment: StoryboardSegmentItem | null, localGenerating: boolean): VideoAssetItem[] {
  if (!segment) return [];
  const current = normalizeMediaUrl(segment.generatedVideo);
  const selected = getSelectedVideoUrl(segment);
  const assets = uniqueUrls([selected, current, ...getVideoHistory(segment)]).map((url) => ({
    id: url,
    url,
    kind: 'asset' as const,
  }));
  if (isVideoGenerating(segment) || localGenerating) {
    const generatingItem: VideoAssetItem = {
      id: `${segment.id}-video-generating`,
      url: '',
      kind: 'generating',
      label: '生成中',
    };
    return [generatingItem, ...assets];
  }
  return assets;
}

function getModelLabel(models: Array<{ id: string; label: string }>, id: string): string {
  return models.find((model) => model.id === id)?.label || id || '默认模型';
}

function uniqueUrls(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const url = normalizeMediaUrl(value);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    result.push(url);
  }
  return result;
}

function resolveClipIndex(segment: StoryboardSegmentItem, segments: StoryboardSegmentItem[]): number {
  const params = asRecord(segment.generationParams) || {};
  const fromParams = Number(params.clip_index || params.clipIndex);
  if (Number.isFinite(fromParams) && fromParams > 0) return Math.floor(fromParams);
  const rawOrder = Number(segment.order);
  if (Number.isFinite(rawOrder) && rawOrder > 0) return Math.floor(rawOrder);
  const index = segments.findIndex((item) => item.id === segment.id);
  return index >= 0 ? index + 1 : 1;
}

function formatDuration(value: unknown): string {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return '8';
  return String(Math.round(num * 1000) / 1000).replace(/\.0+$/, '');
}

function parseDurationInput(value: string): number | null {
  const num = Number(String(value || '').trim());
  if (!Number.isFinite(num) || num < MIN_SEEDANCE_DURATION || num > MAX_SEEDANCE_DURATION) return null;
  return Math.round(num * 1000) / 1000;
}

function isUserCancel(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && 'errMsg' in error
      ? String((error as { errMsg?: unknown }).errMsg || '')
      : String(error || '');
  return /cancel|取消/i.test(message);
}
