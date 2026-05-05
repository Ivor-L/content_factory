import { View, Text, ScrollView, Image, Input, Textarea } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useState } from 'react';
import { miniappApi } from '../../utils/miniapp-api';
import type { ProductSummary } from '../../utils/miniapp-api';
import './index.sass';

type ProductStatusMeta = {
  label: string;
  className: string;
};

type ProductImageDraft = {
  id: string;
  localPath: string;
  url: string;
  status: 'uploading' | 'uploaded' | 'failed';
};

function parseJsonValue(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function collectTextLines(value: unknown, limit = 8): string[] {
  const lines: string[] = [];
  const visit = (current: unknown) => {
    if (lines.length >= limit || current == null) return;
    if (typeof current === 'string') {
      const text = current.trim();
      if (text) lines.push(text);
      return;
    }
    if (typeof current === 'number' || typeof current === 'boolean') {
      lines.push(String(current));
      return;
    }
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    if (typeof current === 'object') {
      const obj = current as Record<string, unknown>;
      const preferred = [
        obj.description,
        obj.selling_point,
        obj.sellingPoint,
        obj.point,
        obj.value,
        obj.title,
        obj.name,
      ];
      preferred.forEach(visit);
      if (lines.length < limit) {
        Object.values(obj).forEach(visit);
      }
    }
  };
  visit(value);
  return Array.from(new Set(lines)).slice(0, limit);
}

function getStatusMeta(product: ProductSummary): ProductStatusMeta {
  const status = String(product.status || '').toUpperCase();
  const analysis = parseJsonValue(product.analysisResult);
  const analysisStatus =
    analysis && typeof analysis === 'object'
      ? String((analysis as Record<string, unknown>).status || '').toUpperCase()
      : '';
  const effectiveStatus = analysisStatus || status;

  if (effectiveStatus.includes('FAIL')) return { label: '分析失败', className: 'failed' };
  if (
    (typeof product.progress === 'number' && product.progress >= 100) ||
    effectiveStatus.includes('COMPLETE') ||
    Boolean(product.sellingPointsText) ||
    collectTextLines(parseJsonValue(product.sellingPoints), 1).length > 0
  ) {
    return { label: '已完成', className: 'completed' };
  }
  if (effectiveStatus.includes('PROCESS') || effectiveStatus.includes('ANALYZ')) {
    return { label: product.progress && product.progress > 0 ? `分析中 ${product.progress}%` : '分析中', className: 'processing' };
  }
  return { label: '未分析', className: 'pending' };
}

export default function ProductLibraryPage() {
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imageDrafts, setImageDrafts] = useState<ProductImageDraft[]>([]);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const list = await miniappApi.getProducts();
      setProducts(list);
      return list;
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '加载产品库失败',
        icon: 'none',
      });
      return [];
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
    setImageDrafts([]);
  };

  const openProductDetail = (productId: string) => {
    if (productId.startsWith('optimistic-')) {
      Taro.showToast({ title: '正在分析，稍后查看详情', icon: 'none' });
      return;
    }
    Taro.navigateTo({ url: `/subpages/product-detail/index?id=${encodeURIComponent(productId)}` });
  };

  const handleCloseModal = () => {
    if (submitting || uploadingImages) return;
    setModalOpen(false);
    resetForm();
  };

  const removeImageDraft = (id: string) => {
    if (submitting || uploadingImages) return;
    setImageDrafts((prev) => prev.filter((item) => item.id !== id));
  };

  const handleChooseImages = async () => {
    if (submitting || uploadingImages) return;

    try {
      const result = await Taro.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
      });
      const paths = (result.tempFilePaths || []).slice(0, 1);
      if (paths.length === 0) return;

      const drafts = paths.map((localPath, index) => ({
        id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
        localPath,
        url: '',
        status: 'uploading' as const,
      }));

      setImageDrafts(drafts);
      setUploadingImages(true);

      let failedUploads = 0;
      await Promise.all(drafts.map(async (draft, index) => {
        try {
          const ext = (draft.localPath.split('.').pop() || 'jpg').toLowerCase();
          const mimeByExt: Record<string, string> = {
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            png: 'image/png',
            webp: 'image/webp',
            heic: 'image/heic',
          };
          const url = await miniappApi.uploadMedia(
            draft.localPath,
            `product-${Date.now()}-${index + 1}.${ext}`,
            mimeByExt[ext] || 'image/jpeg',
          );
          setImageDrafts((prev) => prev.map((item) =>
            item.id === draft.id ? { ...item, url, status: 'uploaded' } : item,
          ));
        } catch {
          failedUploads += 1;
          setImageDrafts((prev) => prev.map((item) =>
            item.id === draft.id ? { ...item, status: 'failed' } : item,
          ));
        }
      }));

      Taro.showToast({
        title: failedUploads > 0 ? `${failedUploads} 张上传失败` : '图片上传完成',
        icon: failedUploads > 0 ? 'none' : 'success',
      });
    } catch {
      // canceled
    } finally {
      setUploadingImages(false);
    }
  };

  const handleCreate = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Taro.showToast({ title: '请填写产品名称', icon: 'none' });
      return;
    }
    if (uploadingImages) {
      Taro.showToast({ title: '图片还在上传中', icon: 'none' });
      return;
    }

    const failedCount = imageDrafts.filter((item) => item.status === 'failed').length;
    if (failedCount > 0) {
      Taro.showToast({ title: '请删除上传失败的图片后重试', icon: 'none' });
      return;
    }

    const imageUrls = imageDrafts
      .map((item) => item.url.trim())
      .filter(Boolean);

    setSubmitting(true);
    const optimisticProduct: ProductSummary = {
      id: `optimistic-${Date.now()}`,
      name: trimmedName,
      description: description.trim(),
      images: imageUrls,
      status: 'PROCESSING',
      progress: 0,
      analysisResult: JSON.stringify({ status: 'ANALYZING' }),
    };
    setModalOpen(false);
    resetForm();
    setProducts((prev) => [optimisticProduct, ...prev]);
    Taro.showToast({ title: '正在分析', icon: 'success' });
    try {
      const created = await miniappApi.createProduct({
        name: trimmedName,
        description: description.trim(),
        images: imageUrls,
      });
      setProducts((prev) => prev.map((item) => (
        item.id === optimisticProduct.id ? created : item
      )));
      await loadProducts();
    } catch (error) {
      setProducts((prev) => prev.filter((item) => item.id !== optimisticProduct.id));
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
              const statusMeta = getStatusMeta(item);
              return (
                <View key={item.id} className='product-library-card' onClick={() => openProductDetail(item.id)}>
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
                    <View className='product-library-card-row'>
                      <Text className='product-library-meta'>素材 {item.images.length} 张</Text>
                      <Text className={`product-library-status product-library-status--${statusMeta.className}`}>
                        {statusMeta.label}
                      </Text>
                    </View>
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

            <Text className='product-modal-label'>产品图片</Text>
            <View
              className={`product-image-picker ${uploadingImages ? 'product-image-picker--disabled' : ''}`}
              onClick={handleChooseImages}
            >
              {imageDrafts[0] ? (
                <>
                  <Image
                    className='product-image-picker-img'
                    src={imageDrafts[0].localPath || imageDrafts[0].url}
                    mode='aspectFill'
                  />
                  {imageDrafts[0].status !== 'uploaded' && (
                    <View className={`product-image-picker-mask product-image-picker-mask--${imageDrafts[0].status}`}>
                      <Text className='product-image-picker-status'>
                        {imageDrafts[0].status === 'uploading' ? '上传中' : '失败'}
                      </Text>
                    </View>
                  )}
                  <View
                    className='product-image-remove'
                    onClick={(event) => {
                      event.stopPropagation();
                      removeImageDraft(imageDrafts[0].id);
                    }}
                  >
                    <Text className='product-image-remove-text'>×</Text>
                  </View>
                </>
              ) : (
                <>
                  <Text className='product-image-picker-plus'>+</Text>
                  <Text className='product-image-picker-text'>
                    {uploadingImages ? '图片上传中...' : '从手机相册选择或拍照'}
                  </Text>
                </>
              )}
            </View>

            <View className='product-modal-actions'>
              <View className='product-modal-cancel' onClick={handleCloseModal}>
                <Text>取消</Text>
              </View>
              <View
                className={`product-modal-confirm ${submitting || uploadingImages ? 'product-modal-confirm--disabled' : ''}`}
                onClick={submitting || uploadingImages ? undefined : handleCreate}
              >
                <Text>{submitting ? '分析中...' : uploadingImages ? '上传中...' : '分析并保存'}</Text>
              </View>
            </View>
          </View>
        </View>
      )}

    </View>
  );
}
