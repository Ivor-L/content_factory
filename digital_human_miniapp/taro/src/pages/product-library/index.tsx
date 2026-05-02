import { View, Text, ScrollView, Image, Input, Textarea } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useState } from 'react';
import { miniappApi } from '../../utils/miniapp-api';
import type { ProductSummary } from '../../utils/miniapp-api';
import './index.sass';

export default function ProductLibraryPage() {
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imagesText, setImagesText] = useState('');

  const loadProducts = async () => {
    setLoading(true);
    try {
      const list = await miniappApi.getProducts();
      setProducts(list);
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '加载产品库失败',
        icon: 'none',
      });
    } finally {
      setLoading(false);
    }
  };

  useDidShow(() => {
    void loadProducts();
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
    setImagesText('');
  };

  const parseImageInput = (value: string): string[] => {
    return value
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  };

  const handleCreate = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Taro.showToast({ title: '请填写产品名称', icon: 'none' });
      return;
    }

    setSubmitting(true);
    try {
      await miniappApi.createProduct({
        name: trimmedName,
        description: description.trim(),
        images: parseImageInput(imagesText),
      });
      Taro.showToast({ title: '产品已添加', icon: 'success' });
      setModalOpen(false);
      resetForm();
      await loadProducts();
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
    <View className='product-library-page'>
      <View className='product-library-header'>
        <View className='product-library-topbar'>
          <View className='product-library-back' onClick={handleBack}>
            <Text className='product-library-back-text'>‹</Text>
          </View>
          <Text className='product-library-title'>产品库</Text>
        </View>
        <Text className='product-library-summary'>共 {products.length} 个产品</Text>
      </View>

      <ScrollView scrollY className='product-library-list'>
        {loading && <Text className='product-library-helper'>加载中...</Text>}

        {!loading && (
          <View className='product-library-grid'>
            <View className='product-library-add-card' onClick={() => setModalOpen(true)}>
              <Text className='product-library-add-card-plus'>+</Text>
              <Text className='product-library-add-card-text'>添加产品</Text>
            </View>
            {products.map((item) => {
              const cover = Array.isArray(item.images) && item.images.length > 0 ? item.images[0] : '';
              return (
                <View key={item.id} className='product-library-card'>
                  <View className='product-library-cover'>
                    {cover ? (
                      <Image className='product-library-cover-image' src={cover} mode='aspectFill' />
                    ) : (
                      <View className='product-library-cover-placeholder'>
                        <Text className='product-library-cover-placeholder-text'>产品</Text>
                      </View>
                    )}
                  </View>
                  <View className='product-library-body'>
                    <Text className='product-library-name'>{item.name}</Text>
                    <Text className='product-library-meta'>素材 {item.images.length} 张</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {!loading && products.length === 0 && (
          <Text className='product-library-helper'>暂无产品，点击上方添加卡片</Text>
        )}
      </ScrollView>

      {modalOpen && (
        <View className='product-modal-overlay'>
          <View className='product-modal-card'>
            <Text className='product-modal-title'>添加产品</Text>

            <Text className='product-modal-label'>产品名称</Text>
            <Input
              className='product-modal-input'
              value={name}
              placeholder='例如：防晒乳'
              onInput={(e) => setName(e.detail.value)}
            />

            <Text className='product-modal-label'>产品描述</Text>
            <Textarea
              className='product-modal-textarea'
              value={description}
              placeholder='可选，简要描述产品卖点'
              onInput={(e) => setDescription(e.detail.value)}
            />

            <Text className='product-modal-label'>图片 URL</Text>
            <Textarea
              className='product-modal-textarea'
              value={imagesText}
              placeholder='可选，每行一条或用逗号分隔'
              onInput={(e) => setImagesText(e.detail.value)}
            />

            <View className='product-modal-actions'>
              <View className='product-modal-cancel' onClick={() => setModalOpen(false)}>
                <Text>取消</Text>
              </View>
              <View
                className={`product-modal-confirm ${submitting ? 'product-modal-confirm--disabled' : ''}`}
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
