import { View, Text, ScrollView, Video, Textarea, Image, Slider, CoverView } from '@tarojs/components';
import Taro, { useDidShow, useLoad, usePullDownRefresh } from '@tarojs/taro';
import { useEffect, useMemo, useRef, useState } from 'react';
import { miniappApi } from '../../utils/miniapp-api';
import { api } from '../../utils/api';
import type { StoryboardSegmentItem, StoryboardTaskStatusResult } from '../../utils/miniapp-api';
import { useMiniappShare } from '../../utils/miniapp-share';
import './index.sass';

const API_BASE_URL = getApiBaseUrl();
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

type ReferenceAssetItem = {
  id: string;
  uri: string;
  type: 'asset' | 'image';
  label: string;
};

type EditableModalResult = Awaited<ReturnType<typeof Taro.showModal>> & {
  content?: string;
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
  useMiniappShare();

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
  const [extendFromPreviousClip, setExtendFromPreviousClip] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const keyboardFocusedRef = useRef(false);

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
        setReferenceImages(getEditableReferenceImages(null, clip.segment));
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
      setReferenceImages(getEditableReferenceImages(data, nextSegment));
      const params = asRecord(nextSegment.generationParams) || {};
      const savedPrompt = String(params.clip_video_prompt || params.clipVideoPrompt || nextSegment.videoPrompt || '').trim();
      setPrompt(savedPrompt);
      setDurationText(formatDuration(nextSegment.duration || 8));
      const nextClipIndex = resolveClipIndex(nextSegment, data.segments);
      setClipIndex(nextClipIndex);
      setTimeRange(String(params.clip_time_range || params.clipTimeRange || nextSegment.timeRange || ''));
      setAspectRatio(resolveSegmentAspectRatio(data, nextSegment));
      setExtendFromPreviousClip(nextClipIndex > 1 && readBooleanFlag(params.seedance_extend_from_previous_clip ?? params.seedanceExtendFromPreviousClip));
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

  useEffect(() => {
    const onKeyboard = (result: { height?: number }) => {
      const nextHeight = Math.max(0, Number(result?.height || 0));
      if (nextHeight > 0 || !keyboardFocusedRef.current) {
        setKeyboardHeight(nextHeight);
      }
    };
    Taro.onKeyboardHeightChange(onKeyboard);
    return () => {
      Taro.offKeyboardHeightChange(onKeyboard);
    };
  }, []);

  const videoUrl = getSelectedVideoUrl(segment);
  const videoAssets = useMemo(() => getVideoAssetItems(segment, generating), [segment, generating]);
  const isProcessing = isVideoGenerating(segment) || generating;
  const settingsSummary = `${getModelLabel(VIDEO_MODELS, videoModel)} · ${formatDuration(durationText)}s · ${aspectRatio}`;
  const composerStyle = useMemo(
    () => (keyboardHeight > 0 ? { bottom: `${keyboardHeight + 8}px` } : undefined),
    [keyboardHeight],
  );

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
      seedance_extend_from_previous_clip: clipIndex > 1 && extendFromPreviousClip,
      seedanceExtendFromPreviousClip: clipIndex > 1 && extendFromPreviousClip,
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
        seedance_extend_from_previous_clip: clipIndex > 1 && extendFromPreviousClip,
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
    const confirmed = await Taro.showModal({
      title: '仅限非真人参考',
      content: 'Seedance 2.0 不支持直接上传含真人人脸的照片。真人形象请先在火山方舟完成人像授权入库，再粘贴资产 ID。',
      confirmText: '上传非真人图',
      cancelText: '取消',
    });
    if (!confirmed.confirm) return;
    try {
      const choose = await Taro.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] });
      const tempPath = choose?.tempFilePaths?.[0];
      if (!tempPath) return;
      setUploading(true);
      const ext = (tempPath.split('.').pop() || 'jpg').toLowerCase();
      const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      const uploaded = await api.uploadMedia(tempPath, `remix-video-ref-${Date.now()}.${ext}`, mime);
      setReferenceImages((prev) => uniqueReferenceUris([...prev, uploaded]).slice(0, 8));
      Taro.showToast({ title: '参考图已添加', icon: 'success' });
    } catch (error) {
      if (!isUserCancel(error)) {
        Taro.showToast({ title: error instanceof Error ? error.message : '上传失败', icon: 'none' });
      }
    } finally {
      setUploading(false);
    }
  };

  const handleAddPortraitAsset = async () => {
    const modal = await Taro.showModal({
      title: '录入人像资产',
      content: '请粘贴火山方舟虚拟人像库或真人授权入库后的 Asset ID，例如 asset-20260222234430-mxpgh。',
      editable: true,
      placeholderText: 'asset-...',
      confirmText: '添加',
      cancelText: '取消',
    } as Parameters<typeof Taro.showModal>[0] & { editable: boolean; placeholderText: string }) as EditableModalResult;
    if (!modal.confirm) return;
    const assetUri = normalizeSeedanceAssetUri(modal.content);
    if (!assetUri) {
      Taro.showToast({ title: '请输入有效 Asset ID', icon: 'none' });
      return;
    }
    setReferenceImages((prev) => uniqueReferenceUris([...prev, assetUri]).slice(0, 8));
    Taro.showToast({ title: '人像资产已添加', icon: 'success' });
  };

  const handleRemoveImage = (url: string) => {
    setReferenceImages((prev) => prev.filter((item) => item !== url));
  };

  const handleDownloadVideo = async () => {
    if (!videoUrl || downloading) return;
    setDownloading(true);
    try {
      const granted = await ensureAlbumPermission();
      if (!granted) return;
      const apiKey = getApiKey();
      const accessToken = getAccessToken();
      const header: Record<string, string> = {};
      if (apiKey) header['x-user-api-key'] = apiKey;
      if (accessToken) header.Authorization = `Bearer ${accessToken}`;
      const downloadRes = await Taro.downloadFile({
        url: buildDownloadUrl(videoUrl, 'video'),
        header: Object.keys(header).length > 0 ? header : undefined,
      });
      if (!downloadRes.tempFilePath || (typeof downloadRes.statusCode === 'number' && downloadRes.statusCode >= 400)) {
        throw new Error(`下载失败:${downloadRes.statusCode || 0}`);
      }
      await Taro.saveVideoToPhotosAlbum({ filePath: downloadRes.tempFilePath });
      Taro.showToast({ title: '已保存到相册', icon: 'success' });
    } catch (error) {
      Taro.showToast({ title: getDownloadErrorMessage(error), icon: 'none' });
    } finally {
      setDownloading(false);
    }
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
                <>
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
                    vslideGesture={false}
                    objectFit='contain'
                    playBtnPosition='center'
                  />
                  <CoverView className='remix-video-detail-player-actions'>
                    <CoverView
                      className={`remix-video-detail-player-action ${downloading ? 'remix-video-detail-player-action--disabled' : ''}`}
                      onClick={() => void handleDownloadVideo()}
                    >
                      <CoverView className='remix-video-detail-player-action-text'>{downloading ? '保存中...' : '下载视频'}</CoverView>
                    </CoverView>
                  </CoverView>
                </>
              ) : (
                <View className='remix-video-detail-placeholder'>
                  {isProcessing && <View className='remix-video-detail-spinner' />}
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
        <View className='remix-video-detail-composer' style={composerStyle}>
          <View className='remix-video-detail-input-card'>
            <View className='remix-video-detail-ref-row'>
              <View className='remix-video-detail-ref-add' onClick={() => void handleAddPortraitAsset()}>
                <Text className='remix-video-detail-ref-add-text'>{uploading ? '...' : '+'}</Text>
                <Text className='remix-video-detail-ref-add-subtext'>真人</Text>
              </View>
              <View className='remix-video-detail-ref-add' onClick={() => void handleChooseImage()}>
                <Text className='remix-video-detail-ref-add-text'>{uploading ? '...' : '+'}</Text>
                <Text className='remix-video-detail-ref-add-subtext'>非真人</Text>
              </View>
              {getReferenceAssetItems(referenceImages).map((item) => (
                <View key={item.id} className={`remix-video-detail-ref-item ${item.type === 'asset' ? 'remix-video-detail-ref-item--asset' : ''}`}>
                  {item.type === 'asset' ? (
                    <View className='remix-video-detail-ref-asset-card'>
                      <Text className='remix-video-detail-ref-asset-title'>可信人像</Text>
                      <Text className='remix-video-detail-ref-asset-id'>{item.label}</Text>
                    </View>
                  ) : (
                    <Image className='remix-video-detail-ref-image' src={item.uri} mode='aspectFill' />
                  )}
                  <View className='remix-video-detail-ref-remove' onClick={() => handleRemoveImage(item.uri)}>
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
              onFocus={(event) => {
                keyboardFocusedRef.current = true;
                const nextHeight = Math.max(0, Number(event.detail.height || 0));
                if (nextHeight > 0) setKeyboardHeight(nextHeight);
              }}
              onBlur={() => {
                keyboardFocusedRef.current = false;
                setKeyboardHeight(0);
              }}
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

            {clipIndex > 1 && (
              <>
                <Text className='remix-video-detail-sheet-label'>连续性</Text>
                <View className='remix-video-detail-sheet-tabs'>
                  <View
                    className={`remix-video-detail-sheet-tab ${extendFromPreviousClip ? 'remix-video-detail-sheet-tab--active' : ''}`}
                    onClick={() => setExtendFromPreviousClip(!extendFromPreviousClip)}
                  >
                    <View className='remix-video-detail-sheet-ratio-copy'>
                      <Text className={`remix-video-detail-sheet-tab-text ${extendFromPreviousClip ? 'remix-video-detail-sheet-tab-text--active' : ''}`}>上一段延长</Text>
                      <Text className={`remix-video-detail-sheet-tab-hint ${extendFromPreviousClip ? 'remix-video-detail-sheet-tab-hint--active' : ''}`}>Clip {clipIndex - 1}</Text>
                    </View>
                  </View>
                </View>
              </>
            )}

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

function normalizeReferenceUri(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || /^(undefined|null|nan)$/i.test(text)) return '';
  const assetUri = normalizeSeedanceAssetUri(text);
  if (assetUri) return assetUri;
  return normalizeMediaUrl(text);
}

function normalizeSeedanceAssetUri(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || /^(undefined|null|nan)$/i.test(text)) return '';
  const normalized = text.replace(/^asset:\s*\/\//i, 'asset://');
  if (/^asset:\/\/[A-Za-z0-9._:-]+$/.test(normalized)) return normalized;
  if (/^asset-[A-Za-z0-9._:-]+$/.test(text)) return `asset://${text}`;
  return '';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function getApiBaseUrl(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

function getAccessToken(): string {
  try {
    return String(Taro.getStorageSync('MINIAPP_ACCESS_TOKEN') || '').trim();
  } catch {
    return '';
  }
}

function buildDownloadUrl(url: string, mediaType: 'image' | 'video'): string {
  const cleanUrl = normalizeMediaUrl(url);
  if (!cleanUrl) return '';
  if (!shouldProxyDownloadUrl(cleanUrl)) return cleanUrl;
  const filename = mediaType === 'video' ? `video-${Date.now()}.mp4` : `image-${Date.now()}.jpg`;
  const path = `/api/proxy/download?url=${encodeURIComponent(cleanUrl)}&filename=${encodeURIComponent(filename)}`;
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}

function shouldProxyDownloadUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    const normalized = hostname.toLowerCase();
    if (
      normalized === 'oss.atomx.top' ||
      normalized.endsWith('.oss.atomx.top') ||
      normalized === 'supabase-api.atomx.top' ||
      normalized.endsWith('.supabase-api.atomx.top') ||
      normalized === 'localhost' ||
      normalized === '127.0.0.1' ||
      normalized.endsWith('.aliyuncs.com') ||
      normalized.endsWith('.volces.com')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
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

function getDownloadErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || '');
  if (/auth|authorize|permission|scope\.writePhotosAlbum/i.test(raw)) return '需要先开启相册权限';
  if (/401|403|unauthorized|forbidden/i.test(raw)) return '登录态已失效，请重新进入页面后再下载';
  if (/saveVideoToPhotosAlbum/i.test(raw)) return '保存失败，请稍后重试';
  if (/url|domain|downloadFile|fail/i.test(raw)) return '视频下载失败，请稍后重试';
  return '下载失败，请稍后重试';
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
  return uniqueReferenceUris(raw.map((item) => normalizeReferenceUri(item)));
}

function getEditableReferenceImages(task: StoryboardTaskStatusResult | null, segment: StoryboardSegmentItem | null): string[] {
  const stored = getStoredReferenceImages(segment);
  if (stored.length > 0) return stored;
  const detailed = asRecord(task?.detailedBreakdown);
  const workflowData = getWorkflowData(task);
  const metadata = asRecord(detailed?.metadata) || {};
  return uniqueReferenceUris([
    normalizeMediaUrl(task?.storyboardImageUrl),
    normalizeMediaUrl(task?.coverImage),
    normalizeMediaUrl(detailed?.storyboard_grid_url),
    normalizeMediaUrl(detailed?.storyboardGridUrl),
    normalizeMediaUrl(workflowData.storyboard_grid_url),
    normalizeMediaUrl(workflowData.storyboardGridUrl),
    normalizeMediaUrl(metadata.original_storyboard_grid_url),
    normalizeMediaUrl(metadata.originalStoryboardGridUrl),
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

function uniqueReferenceUris(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const uri = normalizeReferenceUri(value);
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    result.push(uri);
  }
  return result;
}

function getReferenceAssetItems(values: string[]): ReferenceAssetItem[] {
  return uniqueReferenceUris(values).map((uri) => {
    const assetId = uri.startsWith('asset://') ? uri.replace(/^asset:\/\//, '') : '';
    return {
      id: uri,
      uri,
      type: assetId ? 'asset' : 'image',
      label: assetId || '参考图',
    };
  });
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

function readBooleanFlag(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value !== 'string') return false;
  return ['1', 'true', 'yes', 'y', '是', '开启'].includes(value.trim().toLowerCase());
}
