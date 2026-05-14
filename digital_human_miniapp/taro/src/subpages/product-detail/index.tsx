import { View, Text, ScrollView, Image, Input, Textarea } from '@tarojs/components';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import { useState } from 'react';
import { miniappApi } from '../../utils/miniapp-api';
import type { ProductSummary } from '../../utils/miniapp-api';
import { useMiniappShare } from '../../utils/miniapp-share';
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

function collectTextLines(value: unknown, limit = 10): string[] {
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
      [
        obj.description,
        obj.selling_point,
        obj.sellingPoint,
        obj.point,
        obj.value,
        obj.title,
        obj.name,
      ].forEach(visit);
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
    return {
      label: product.progress && product.progress > 0 ? `分析中 ${product.progress}%` : '分析中',
      className: 'processing',
    };
  }
  return { label: '未分析', className: 'pending' };
}

function getAnalysisLines(product: ProductSummary): string[] {
  if (product.sellingPointsText?.trim()) return [product.sellingPointsText.trim()];
  const parsedSellingPoints = parseJsonValue(product.sellingPoints);
  const pointLines = collectTextLines(parsedSellingPoints, 12);
  if (pointLines.length > 0) return pointLines;
  return collectTextLines(parseJsonValue(product.analysisResult), 12);
}

function stringifyRawAnalysis(product: ProductSummary): string {
  const parsedSellingPoints = parseJsonValue(product.sellingPoints);
  if (parsedSellingPoints) return JSON.stringify(parsedSellingPoints, null, 2);
  const parsedAnalysis = parseJsonValue(product.analysisResult);
  if (parsedAnalysis) return JSON.stringify(parsedAnalysis, null, 2);
  return product.sellingPoints || product.analysisResult || '';
}

function imageDraftsFromProduct(product: ProductSummary): ProductImageDraft[] {
  return product.images.map((url, index) => ({
    id: `${product.id}-${index}`,
    localPath: url,
    url,
    status: 'uploaded',
  }));
}

export default function ProductDetailPage() {
  useMiniappShare();

  const router = useRouter();
  const productId = String(router.params?.id || '').trim();
  const [product, setProduct] = useState<ProductSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imageDrafts, setImageDrafts] = useState<ProductImageDraft[]>([]);

  const loadProduct = async () => {
    if (!productId) {
      Taro.showToast({ title: '缺少产品 ID', icon: 'none' });
      return;
    }
    setLoading(true);
    try {
      const latest = await miniappApi.getProduct(productId);
      setProduct(latest);
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '加载产品失败',
        icon: 'none',
      });
    } finally {
      setLoading(false);
    }
  };

  useDidShow(() => {
    void loadProduct();
  });

  const handleBack = () => {
    const pages = Taro.getCurrentPages();
    if (pages.length > 1) {
      Taro.navigateBack({ delta: 1 });
      return;
    }
    Taro.navigateTo({ url: '/subpages/product-library/index' });
  };

  const openEdit = () => {
    if (!product) return;
    setName(product.name);
    setDescription(product.description || '');
    setImageDrafts(imageDraftsFromProduct(product));
    setEditOpen(true);
  };

  const closeEdit = () => {
    if (submitting || uploadingImages) return;
    setEditOpen(false);
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

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!product || !trimmedName) {
      Taro.showToast({ title: '请填写产品名称', icon: 'none' });
      return;
    }
    if (uploadingImages) {
      Taro.showToast({ title: '图片还在上传中', icon: 'none' });
      return;
    }
    if (imageDrafts.some((item) => item.status === 'failed')) {
      Taro.showToast({ title: '请删除上传失败的图片后重试', icon: 'none' });
      return;
    }

    const imageUrls = imageDrafts.map((item) => item.url.trim()).filter(Boolean);
    setSubmitting(true);
    const optimisticProduct: ProductSummary = {
      ...product,
      name: trimmedName,
      description: description.trim(),
      images: imageUrls,
      status: 'PROCESSING',
      progress: 0,
      analysisResult: JSON.stringify({ status: 'ANALYZING' }),
    };
    setProduct(optimisticProduct);
    setEditOpen(false);
    Taro.showToast({ title: '正在分析', icon: 'success' });
    try {
      const saved = await miniappApi.updateProduct(product.id, {
        name: trimmedName,
        description: description.trim(),
        images: imageUrls,
      });
      setProduct(saved);
    } catch (error) {
      setProduct(product);
      Taro.showToast({
        title: error instanceof Error ? error.message : '保存失败',
        icon: 'none',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!product) return;
    const result = await Taro.showModal({
      title: '删除产品',
      content: '删除后无法恢复，确定删除这个产品吗？',
      confirmText: '删除',
      confirmColor: '#e64e4e',
    });
    if (!result.confirm) return;

    setSubmitting(true);
    try {
      await miniappApi.deleteProduct(product.id);
      Taro.showToast({ title: '已删除', icon: 'success' });
      setTimeout(() => {
        handleBack();
      }, 300);
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '删除失败',
        icon: 'none',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const previewProductImage = (current: string) => {
    const urls = product?.images?.filter(Boolean) || [];
    if (urls.length === 0) return;
    Taro.previewImage({ current, urls });
  };

  const statusMeta = product ? getStatusMeta(product) : null;
  const cover = product?.images?.[0] || '';
  const analysisLines = product ? getAnalysisLines(product) : [];
  const rawAnalysis = product ? stringifyRawAnalysis(product) : '';

  return (
    <View className='product-detail-page'>
      <View className='product-detail-nav'>
        <View className='product-detail-back' onClick={handleBack}>
          <Text className='product-detail-back-text'>‹</Text>
        </View>
        <Text className='product-detail-nav-title'>产品详情</Text>
      </View>

      <ScrollView scrollY className='product-detail-scroll'>
        {loading && !product ? (
          <Text className='product-detail-helper'>加载中...</Text>
        ) : null}

        {product ? (
          <View className='product-detail-content'>
            <View className='product-detail-photo-panel'>
              {cover ? (
                <Image
                  className='product-detail-hero-image'
                  src={cover}
                  mode='aspectFit'
                  onClick={() => previewProductImage(cover)}
                />
              ) : (
                <View className='product-detail-photo-placeholder'>
                  <Text className='product-detail-photo-placeholder-text'>产品照片</Text>
                </View>
              )}
            </View>

            {product.images.length > 1 ? (
              <ScrollView scrollX className='product-detail-thumbs'>
                {product.images.map((url, index) => (
                  <View
                    key={`${url}-${index}`}
                    className='product-detail-thumb'
                    onClick={() => previewProductImage(url)}
                  >
                    <Image className='product-detail-thumb-img' src={url} mode='aspectFit' />
                  </View>
                ))}
              </ScrollView>
            ) : null}

            <View className='product-detail-info'>
              <View className='product-detail-title-row'>
                <View className='product-detail-title-block'>
                  <Text className='product-detail-title'>{product.name}</Text>
                  {product.description ? (
                    <Text className='product-detail-description'>{product.description}</Text>
                  ) : null}
                </View>
                {statusMeta ? (
                  <Text className={`product-detail-status product-detail-status--${statusMeta.className}`}>
                    {statusMeta.label}
                  </Text>
                ) : null}
              </View>

              <View className='product-detail-section'>
                <View className='product-detail-section-head'>
                  <Text className='product-detail-section-title'>分析结果</Text>
                  <Text className='product-detail-refresh' onClick={loadProduct}>刷新</Text>
                </View>
                {analysisLines.length > 0 ? (
                  analysisLines.map((line, index) => (
                    <Text key={`${line}-${index}`} className='product-detail-point'>
                      {line}
                    </Text>
                  ))
                ) : (
                  <Text className='product-detail-empty'>暂无分析结果，稍后刷新查看</Text>
                )}
              </View>

              {rawAnalysis ? (
                <View className='product-detail-section'>
                  <Text className='product-detail-section-title'>原始分析内容</Text>
                  <ScrollView scrollY className='product-detail-raw'>
                    <Text className='product-detail-raw-text'>{rawAnalysis}</Text>
                  </ScrollView>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}
      </ScrollView>

      {product ? (
        <View className='product-detail-bottom-actions'>
          <View className='product-detail-bottom-delete' onClick={handleDelete}>
            <Text>删除产品</Text>
          </View>
          <View className='product-detail-bottom-edit' onClick={openEdit}>
            <Text>编辑产品</Text>
          </View>
        </View>
      ) : null}

      {editOpen && (
        <View className='product-detail-modal-overlay'>
          <View className='product-detail-modal-card'>
            <Text className='product-detail-modal-title'>编辑产品</Text>

            <Text className='product-detail-modal-label'>产品名称</Text>
            <Input
              className='product-detail-modal-input'
              value={name}
              placeholder='例如：防晒乳'
              onInput={(e) => setName(e.detail.value)}
            />

            <Text className='product-detail-modal-label'>产品描述</Text>
            <Textarea
              className='product-detail-modal-textarea'
              value={description}
              placeholder='可选，简要描述产品卖点'
              onInput={(e) => setDescription(e.detail.value)}
            />

            <Text className='product-detail-modal-label'>产品图片</Text>
            <View
              className={`product-detail-image-picker ${uploadingImages ? 'product-detail-image-picker--disabled' : ''}`}
              onClick={handleChooseImages}
            >
              {imageDrafts[0] ? (
                <>
                  <Image
                    className='product-detail-image-picker-img'
                    src={imageDrafts[0].localPath || imageDrafts[0].url}
                    mode='aspectFill'
                  />
                  {imageDrafts[0].status !== 'uploaded' ? (
                    <View className={`product-detail-image-picker-mask product-detail-image-picker-mask--${imageDrafts[0].status}`}>
                      <Text className='product-detail-image-picker-status'>
                        {imageDrafts[0].status === 'uploading' ? '上传中' : '失败'}
                      </Text>
                    </View>
                  ) : null}
                  <View
                    className='product-detail-image-remove'
                    onClick={(event) => {
                      event.stopPropagation();
                      removeImageDraft(imageDrafts[0].id);
                    }}
                  >
                    <Text className='product-detail-image-remove-text'>×</Text>
                  </View>
                </>
              ) : (
                <>
                  <Text className='product-detail-image-picker-plus'>+</Text>
                  <Text className='product-detail-image-picker-text'>
                    {uploadingImages ? '图片上传中...' : '从相册选择或拍照'}
                  </Text>
                </>
              )}
            </View>

            <View className='product-detail-modal-actions'>
              <View className='product-detail-modal-cancel' onClick={closeEdit}>
                <Text>取消</Text>
              </View>
              <View
                className={`product-detail-modal-confirm ${submitting || uploadingImages ? 'product-detail-modal-confirm--disabled' : ''}`}
                onClick={submitting || uploadingImages ? undefined : handleSave}
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
