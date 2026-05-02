import { View, Text, ScrollView, Textarea, Image } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { useState } from 'react';
import { api } from '../../utils/api';
import { miniappApi } from '../../utils/miniapp-api';
import './index.sass';

const SOURCE_TYPES = [
  { key: 'IMAGE', label: '图片数字人' },
  { key: 'VIDEO', label: '视频数字人' },
] as const;

const MODES = [
  { key: 'VOICE_CLONE', label: '文字驱动', desc: '输入脚本文字，AI 自动克隆音色并合成语音' },
  { key: 'LIP_SYNC', label: '音频驱动', desc: '上传已有音频，直接用于口型同步' },
] as const;

const VIDEO_CATEGORIES = [
  { key: 'MARKETING', label: '营销视频' },
  { key: 'SHORT_DRAMA', label: 'AI短剧' },
  { key: 'SKELETON_3D', label: '3D骨骼' },
] as const;

export default function GeneratePage() {
  const [pageMode, setPageMode] = useState<'digital-human' | 'video-generate'>('digital-human');
  const [videoCategory, setVideoCategory] = useState<'MARKETING' | 'SHORT_DRAMA' | 'SKELETON_3D'>('SKELETON_3D');
  const [sourceType, setSourceType] = useState<'IMAGE' | 'VIDEO'>('IMAGE');
  const [mode, setMode] = useState<'VOICE_CLONE' | 'LIP_SYNC'>('VOICE_CLONE');
  const [characters, setCharacters] = useState<any[]>([]);
  const [selectedCharIdx, setSelectedCharIdx] = useState(0);
  const [script, setScript] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [skeletonScript, setSkeletonScript] = useState('');
  const [products, setProducts] = useState<Array<{ id: string; name: string; images: string[] }>>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useLoad((options) => {
    const feature = String(options?.feature || '').trim().toLowerCase();
    const category = String(options?.category || '').trim().toLowerCase();
    if (feature === 'video-generate') {
      setPageMode('video-generate');
      if (category === 'marketing') setVideoCategory('MARKETING');
      if (category === 'short-drama') setVideoCategory('SHORT_DRAMA');
      if (category === 'skeleton-3d') setVideoCategory('SKELETON_3D');
      void (async () => {
        try {
          const list = await miniappApi.getProducts();
          setProducts(list);
        } catch {
          // 产品为可选项，拉取失败不阻断功能
        }
      })();
      return;
    }

    setPageMode('digital-human');
    void (async () => {
      try {
        const data = await api.getDigitalHumans();
        setCharacters(data);
      } catch {
        Taro.showToast({ title: '加载形象失败', icon: 'none' });
      }
    })();
  });

  const selectedChar = characters[selectedCharIdx];

  const handleSubmitSkeletonStoryboard = async () => {
    if (!skeletonScript.trim()) {
      Taro.showToast({ title: '请输入分镜脚本文案', icon: 'none' });
      return;
    }
    setSubmitting(true);
    try {
      const result = await miniappApi.createStoryboardJob({
        pipelineKey: 'skeleton_video',
        title: '小程序骷髅分镜视频',
        script: skeletonScript.trim(),
        productId: selectedProductId || undefined,
        source: 'miniapp_generate_page',
        metadata: {
          entry: 'generate_page',
          feature: 'skeleton_storyboard',
          selected_product_id: selectedProductId || null,
        },
      });
      Taro.showToast({ title: '分镜任务已创建', icon: 'success' });
      setSkeletonScript('');
      Taro.navigateTo({
        url: `/subpages/storyboard-board/index?id=${encodeURIComponent(result.taskId)}&title=${encodeURIComponent('3D骨骼分镜板')}`,
      });
    } catch (err) {
      Taro.showToast({ title: (err as Error).message || '提交失败', icon: 'none' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSwitchSourceType = (nextType: 'IMAGE' | 'VIDEO') => {
    if (sourceType === nextType) return;
    setSourceType(nextType);
    setAudioUrl('');
  };

  const ensureProductsLoaded = async () => {
    if (products.length > 0) return;
    try {
      const list = await miniappApi.getProducts();
      setProducts(list);
    } catch {
      // ignore
    }
  };

  const handleChooseAudio = async () => {
    const res = await Taro.chooseMessageFile({ count: 1, type: 'file', extension: ['mp3', 'wav', 'm4a', 'aac'] });
    const file = res.tempFiles[0];
    setUploadingAudio(true);
    try {
      const url = await api.uploadMedia(file.path, file.name, 'audio/mpeg');
      setAudioUrl(url);
    } catch {
      Taro.showToast({ title: '音频上传失败', icon: 'none' });
    } finally {
      setUploadingAudio(false);
    }
  };

  const handleChooseVideo = async () => {
    const chooseRes = await Taro.chooseVideo({
      sourceType: ['album'],
      compressed: true,
    });
    if (!chooseRes?.tempFilePath) return;

    const filePath = chooseRes.tempFilePath;
    const ext = (filePath.split('.').pop() || 'mp4').toLowerCase();
    const mimeByExt: Record<string, string> = {
      mp4: 'video/mp4',
      mov: 'video/quicktime',
      m4v: 'video/mp4',
      webm: 'video/webm',
    };
    const mimeType = mimeByExt[ext] || 'video/mp4';
    const filename = `digital-human-source-${Date.now()}.${ext}`;

    setUploadingVideo(true);
    try {
      const url = await api.uploadMedia(filePath, filename, mimeType);
      setVideoUrl(url);
    } catch {
      Taro.showToast({ title: '视频上传失败', icon: 'none' });
    } finally {
      setUploadingVideo(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedChar) {
      Taro.showToast({ title: '请先在形象库添加数字人', icon: 'none' });
      return;
    }
    if (!selectedChar.voiceUrl) {
      Taro.showToast({ title: '该形象未绑定音色', icon: 'none' });
      return;
    }
    if (sourceType === 'VIDEO' && !videoUrl) {
      Taro.showToast({ title: '请先上传驱动视频', icon: 'none' });
      return;
    }
    if (mode === 'VOICE_CLONE' && !script.trim()) {
      Taro.showToast({ title: '请输入脚本内容', icon: 'none' });
      return;
    }
    if (mode === 'LIP_SYNC' && !audioUrl) {
      Taro.showToast({ title: '请上传驱动音频', icon: 'none' });
      return;
    }

    setSubmitting(true);
    try {
      const requestPayload =
        sourceType === 'VIDEO'
          ? {
            type: mode,
            sourceType: 'VIDEO' as const,
            videoUrl,
            audioUrl: mode === 'LIP_SYNC' ? audioUrl : (selectedChar.voiceUrl || ''),
            scriptContent: mode === 'VOICE_CLONE' ? script.trim() : undefined,
          }
          : {
            type: mode,
            sourceType: 'IMAGE' as const,
            imageUrl: selectedChar.imageUrl,
            audioUrl: mode === 'LIP_SYNC' ? audioUrl : selectedChar.voiceUrl!,
            scriptContent: mode === 'VOICE_CLONE' ? script.trim() : undefined,
          };

      await api.createDigitalHumanTask({
        ...requestPayload,
      });
      Taro.showToast({ title: '已提交生成任务', icon: 'success' });
      setScript('');
      setAudioUrl('');
      if (sourceType === 'VIDEO') setVideoUrl('');
    } catch (err) {
      Taro.showToast({ title: (err as Error).message || '提交失败', icon: 'none' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    const pages = Taro.getCurrentPages();
    if (pages.length > 1) {
      Taro.navigateBack({ delta: 1 });
      return;
    }
    Taro.switchTab({ url: '/pages/home/index' });
  };

  const handleGoRoleLibrary = () => {
    Taro.navigateTo({ url: '/subpages/warehouse/index' });
  };

  const handleFindInspiration = () => {
    Taro.setStorageSync('HOT_SQUARE_DEFAULT_FILTER', 'video');
    Taro.switchTab({ url: '/pages/hot-square/index' });
  };

  const handlePasteScript = async () => {
    try {
      const clip = await Taro.getClipboardData();
      const text = (clip.data || '').trim();
      if (!text) {
        Taro.showToast({ title: '剪贴板为空', icon: 'none' });
        return;
      }
      setScript((prev) => (prev ? `${prev}\n${text}` : text));
      Taro.showToast({ title: '已粘贴', icon: 'success' });
    } catch {
      Taro.showToast({ title: '粘贴失败', icon: 'none' });
    }
  };

  const renderSectionTitle = (icon: string, title: string) => (
    <View className='section-title-row'>
      <View className={`section-title-icon section-title-icon--${icon}`} />
      <Text className='section-title'>{title}</Text>
    </View>
  );

  const showFixedSubmit = pageMode === 'digital-human' || (pageMode === 'video-generate' && videoCategory === 'SKELETON_3D');
  const fixedSubmitLabel = pageMode === 'video-generate' && videoCategory === 'SKELETON_3D'
    ? (submitting ? '提交中...' : '开始生成分镜视频')
    : (submitting ? '提交中...' : '开始生成');

  const handleFixedSubmit = () => {
    if (submitting) return;
    if (pageMode === 'video-generate' && videoCategory === 'SKELETON_3D') {
      void handleSubmitSkeletonStoryboard();
      return;
    }
    void handleSubmit();
  };

  return (
    <>
      <ScrollView scrollY className='generate-page'>
        <View className='generate-header'>
          <View className='generate-topbar'>
            <View className='generate-back' onClick={handleBack}>
              <Text className='generate-back-text'>‹</Text>
            </View>
            <Text className='generate-page-title'>{pageMode === 'video-generate' ? '视频生成' : '数字人'}</Text>
          </View>

          {pageMode === 'digital-human' && (
            <View className='top-switch-tabs'>
              {SOURCE_TYPES.map((item) => (
                <View
                  key={item.key}
                  className={`top-switch-tab ${sourceType === item.key ? 'top-switch-tab--active' : ''}`}
                  onClick={() => handleSwitchSourceType(item.key)}
                >
                  <Text className='top-switch-label'>{item.label}</Text>
                  {sourceType === item.key && <View className='top-switch-underline' />}
                </View>
              ))}
            </View>
          )}
          {pageMode === 'video-generate' && (
            <View className='top-switch-tabs'>
              {VIDEO_CATEGORIES.map((item) => (
                <View
                  key={item.key}
                  className={`top-switch-tab ${videoCategory === item.key ? 'top-switch-tab--active' : ''}`}
                  onClick={() => {
                    setVideoCategory(item.key);
                    if (item.key === 'SKELETON_3D') {
                      void ensureProductsLoaded();
                    }
                  }}
                >
                  <Text className='top-switch-label'>{item.label}</Text>
                  {videoCategory === item.key && <View className='top-switch-underline' />}
                </View>
              ))}
            </View>
          )}
        </View>

        {pageMode === 'video-generate' && (
          <>
            {videoCategory === 'SKELETON_3D' ? (
              <>
                <View className='section'>
                  {renderSectionTitle('script', '3D骨骼分镜脚本文案')}
                  <Textarea
                    className='script-input'
                    value={skeletonScript}
                    onInput={(e) => setSkeletonScript(e.detail.value)}
                    placeholder='输入产品描述、卖点或参考脚本，系统会自动生成骷髅分镜与提示词...'
                    maxlength={3000}
                  />
                  <Text className='char-count'>{skeletonScript.length}/3000</Text>
                </View>

                <View className='section'>
                  {renderSectionTitle('product', '产品（可选）')}
                  <ScrollView scrollX className='character-scroll'>
                    <View className='character-list'>
                      <View
                        className={`character-item ${selectedProductId === '' ? 'character-item--active' : ''}`}
                        onClick={() => setSelectedProductId('')}
                      >
                        <View className='character-avatar character-avatar--option'>
                          <View className='character-option-icon' />
                        </View>
                        <Text className='character-name'>不使用产品</Text>
                      </View>
                      {products.map((product) => (
                        <View
                          key={product.id}
                          className={`character-item ${selectedProductId === product.id ? 'character-item--active' : ''}`}
                          onClick={() => setSelectedProductId(product.id)}
                        >
                          {product.images?.[0] ? (
                            <Image className='character-avatar' src={product.images[0]} mode='aspectFill' />
                          ) : (
                            <View className='character-avatar' />
                          )}
                          <Text className='character-name'>{product.name}</Text>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                  {products.length === 0 && <Text className='empty-hint'>暂无产品，可直接生成；后续可在产品库添加。</Text>}
                </View>

                <View className='section'>
                  <Text className='mode-desc'>任务创建后会进入分镜工作流，完成后可在「作品」里查看状态与结果。</Text>
                </View>
              </>
            ) : (
              <View className='section'>
                <Text className='mode-desc'>
                  {videoCategory === 'MARKETING' ? '营销视频能力即将开放，敬请期待。' : 'AI短剧能力即将开放，敬请期待。'}
                </Text>
              </View>
            )}
          </>
        )}

        {pageMode === 'digital-human' && (
          <>
            <View className='section'>
              {renderSectionTitle('role', '选择数字人角色')}
              <ScrollView scrollX className='character-scroll'>
                <View className='character-list'>
                  <View className='character-item character-item--add' onClick={handleGoRoleLibrary}>
                    <View className='character-add-plus'>+</View>
                    <Text className='character-add-name'>添加角色</Text>
                  </View>
                  {characters.map((char, idx) => (
                    <View
                      key={char.id ?? idx}
                      className={`character-item ${idx === selectedCharIdx ? 'character-item--active' : ''}`}
                      onClick={() => setSelectedCharIdx(idx)}
                    >
                      <Image className='character-avatar' src={char.imageUrl} mode='aspectFill' />
                      <Text className='character-name'>{char.name || `形象 ${idx + 1}`}</Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
              {characters.length === 0 && <Text className='empty-hint'>暂无形象，请先在「形象库」添加</Text>}
            </View>

            {sourceType === 'VIDEO' && (
              <View className='section'>
                {renderSectionTitle('upload-video', '上传驱动视频')}
                <View className='upload-row upload-row--large' onClick={handleChooseVideo}>
                  <View className='upload-row-content'>
                    <Text className='upload-row-plus'>+</Text>
                    <Text className='upload-row-text'>
                      {videoUrl ? '已上传视频，点击更换' : uploadingVideo ? '上传中...' : '点击选择视频文件'}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            <View className='section'>
              <View className='mode-tabs'>
                {MODES.map((m) => (
                  <View
                    key={m.key}
                    className={`mode-tab ${mode === m.key ? 'mode-tab--active' : ''}`}
                    onClick={() => setMode(m.key)}
                  >
                    <Text className='mode-tab-label'>{m.label}</Text>
                  </View>
                ))}
              </View>
              <Text className='mode-desc'>{MODES.find((m) => m.key === mode)?.desc}</Text>
            </View>

            {mode === 'VOICE_CLONE' && (
              <View className='section'>
                {renderSectionTitle('text', '脚本内容')}
                <View className='script-input-box'>
                  <Textarea
                    className='script-input script-input--flat'
                    value={script}
                    onInput={(e) => setScript(e.detail.value)}
                    placeholder='在此输入你想让数字人说的文字...'
                    maxlength={500}
                  />
                  <View className='info-input-actions'>
                    <View className='input-action-btn' onClick={handleFindInspiration}>
                      <Text className='input-action-btn-text'>没有文案？去找灵感</Text>
                    </View>
                    <View className='input-action-btn input-action-btn--ghost' onClick={handlePasteScript}>
                      <Text className='input-action-btn-text input-action-btn-text--ghost'>粘贴</Text>
                    </View>
                  </View>
                </View>
                <Text className='char-count'>{script.length}/500</Text>
              </View>
            )}

            {mode === 'LIP_SYNC' && (
              <View className='section'>
                {renderSectionTitle('audio', '驱动音频')}
                <View className='upload-row' onClick={handleChooseAudio}>
                  <View className='upload-row-content'>
                    <Text className='upload-row-plus'>+</Text>
                    <Text className='upload-row-text'>
                      {audioUrl ? '已上传音频，点击更换' : uploadingAudio ? '上传中...' : '点击选择音频文件'}
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {showFixedSubmit && (
        <View className='fixed-submit-area'>
          <View
            className={`btn-primary ${submitting ? 'btn-disabled' : ''}`}
            onClick={handleFixedSubmit}
          >
            <Text className='btn-text'>{fixedSubmitLabel}</Text>
          </View>
        </View>
      )}
    </>
  );
}
