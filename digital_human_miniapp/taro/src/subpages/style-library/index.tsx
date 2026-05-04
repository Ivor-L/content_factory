import { View, Text, ScrollView, Image, Input, Textarea } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useState } from 'react';
import { miniappApi } from '../../utils/miniapp-api';
import type { StylePresetSummary } from '../../utils/miniapp-api';
import './index.sass';

export default function StyleLibraryPage() {
  const [styles, setStyles] = useState<StylePresetSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');

  const loadStyles = async () => {
    setLoading(true);
    try {
      const list = await miniappApi.listStylePresets('xhs-visual');
      setStyles(list.filter((item) => item.status !== 'FAILED'));
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '加载风格库失败',
        icon: 'none',
      });
    } finally {
      setLoading(false);
    }
  };

  useDidShow(() => {
    void loadStyles();
  });

  const handleBack = () => {
    const pages = Taro.getCurrentPages();
    if (pages.length > 1) {
      Taro.navigateBack({ delta: 1 });
      return;
    }
    Taro.switchTab({ url: '/pages/profile/index' });
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setPreviewUrl('');
  };

  const handleCreate = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Taro.showToast({ title: '请填写风格名称', icon: 'none' });
      return;
    }

    setSubmitting(true);
    try {
      await miniappApi.createStylePreset({
        name: trimmedName,
        type: 'xhs-visual',
        description: description.trim(),
        previewUrl: previewUrl.trim(),
        spec: {
          mode: 'manual',
          source: 'miniapp',
          notes: description.trim(),
        },
        metadata: {
          source: 'miniapp-manual',
          processingStatus: 'PENDING',
        },
      });
      Taro.showToast({ title: '风格已添加', icon: 'success' });
      setModalOpen(false);
      resetForm();
      await loadStyles();
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '添加失败',
        icon: 'none',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className='style-library-page'>
      <View className='style-library-header'>
        <View className='style-library-topbar'>
          <View className='style-library-back' onClick={handleBack}>
            <Text className='style-library-back-text'>‹</Text>
          </View>
          <Text className='style-library-title'>风格库</Text>
        </View>
        <Text className='style-library-summary'>共 {styles.length} 套风格</Text>
      </View>

      <ScrollView scrollY className='style-library-list'>
        {loading && <Text className='style-library-helper'>加载中...</Text>}

        {!loading && (
          <View className='style-library-grid'>
            <View className='style-library-add-card' onClick={() => setModalOpen(true)}>
              <Text className='style-library-add-card-plus'>+</Text>
              <Text className='style-library-add-card-text'>添加风格</Text>
            </View>
            {styles.map((item, index) => (
              <View key={item.id} className='style-library-card'>
                <View className='style-library-cover'>
                  {item.thumbnailUrl || item.previewUrl ? (
                    <Image
                      className='style-library-cover-image'
                      src={item.thumbnailUrl || item.previewUrl || ''}
                      mode='aspectFill'
                      lazyLoad
                    />
                  ) : (
                    <View className='style-library-cover-placeholder'>
                      <Text className='style-library-cover-placeholder-text'>风格 {index + 1}</Text>
                    </View>
                  )}
                </View>
                <View className='style-library-body'>
                  <Text className='style-library-name'>{item.name}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {!loading && styles.length === 0 && (
          <Text className='style-library-helper'>暂无可用风格，点击上方添加卡片</Text>
        )}
      </ScrollView>

      {modalOpen && (
        <View className='style-modal-overlay'>
          <View className='style-modal-card'>
            <Text className='style-modal-title'>添加风格</Text>

            <Text className='style-modal-label'>风格名称</Text>
            <Input
              className='style-modal-input'
              value={name}
              placeholder='例如：简约高对比'
              onInput={(e) => setName(e.detail.value)}
            />

            <Text className='style-modal-label'>风格描述</Text>
            <Textarea
              className='style-modal-textarea'
              value={description}
              placeholder='可选，描述风格用途与调性'
              onInput={(e) => setDescription(e.detail.value)}
            />

            <Text className='style-modal-label'>预览图 URL</Text>
            <Input
              className='style-modal-input'
              value={previewUrl}
              placeholder='可选，填写图片 URL'
              onInput={(e) => setPreviewUrl(e.detail.value)}
            />

            <View className='style-modal-actions'>
              <View className='style-modal-cancel' onClick={() => setModalOpen(false)}>
                <Text>取消</Text>
              </View>
              <View
                className={`style-modal-confirm ${submitting ? 'style-modal-confirm--disabled' : ''}`}
                onClick={submitting ? undefined : handleCreate}
              >
                <Text>{submitting ? '添加中...' : '确认添加'}</Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
