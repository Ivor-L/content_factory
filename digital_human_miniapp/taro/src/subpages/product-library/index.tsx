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
  if (effectiveStatus.includes('PROCESS') || effectiveStatus.includes('ANALYZ')) {
    return { label: product.progress && product.progress > 0 ? `分析中 ${product.progress}%` : '分析中', className: 'processing' };
  }
  if (
    effectiveStatus.includes('COMPLETE') ||
    Boolean(product.sellingPointsText) ||
    collectTextLines(parseJsonValue(product.sellingPoints), 1).length > 0
  ) {
    return { label: '分析完成', className: 'completed' };
  }
  return { label: '未分析', className: 'pending' };
}

function getAnalysisLines(product: ProductSummary): string[] {
  if (product.sellingPointsText?.trim()) return [product.sellingPointsText.trim()];
  const parsedSellingPoints = parseJsonValue(product.sellingPoints);
  const pointLines = collectTextLines(parsedSellingPoints, 10);
  if (pointLines.length > 0) return pointLines;
  const parsedAnalysis = parseJsonValue(product.analysisResult);
  return collectTextLines(parsedAnalysis, 10);
}

function stringifyRawAnalysis(product: ProductSummary): string {
  const parsedSellingPoints = parseJsonValue(product.sellingPoints);
  if (parsedSellingPoints) return JSON.stringify(parsedSellingPoints, null, 2);
  const parsedAnalysis = parseJsonValue(product.analysisResult);
  if (parsedAnalysis) return JSON.stringify(parsedAnalysis, null, 2);
  return product.sellingPoints || product.analysisResult || '';
}

export default function ProductLibraryPage() {
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [detailProduct, setDetailProduct] = useState<ProductSummary | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imagesText, setImagesText] = useState('');

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
      Taro.showToast({ title: '产品已提交分析', icon: 'success' });
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
              const statusMeta = getStatusMeta(item);
              return (
                <View key={item.id} className='product-library-card' onClick={() => setDetailProduct(item)}>
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
                <Text>{submitting ? '分析中...' : '分析并保存'}</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {detailProduct && (
        <View className='product-modal-overlay' onClick={() => setDetailProduct(null)}>
          <View className='product-detail-card' onClick={(event) => event.stopPropagation()}>
            <View className='product-detail-header'>
              <View>
                <Text className='product-detail-title'>{detailProduct.name}</Text>
                <Text className='product-detail-subtitle'>产品分析结果</Text>
              </View>
              <Text
                className={`product-library-status product-library-status--${getStatusMeta(detailProduct).className}`}
              >
                {getStatusMeta(detailProduct).label}
              </Text>
            </View>

            {detailProduct.description ? (
              <View className='product-detail-section'>
                <Text className='product-detail-label'>产品描述</Text>
                <Text className='product-detail-text'>{detailProduct.description}</Text>
              </View>
            ) : null}

            <View className='product-detail-section'>
              <Text className='product-detail-label'>分析摘要</Text>
              {getAnalysisLines(detailProduct).length > 0 ? (
                getAnalysisLines(detailProduct).map((line, index) => (
                  <Text key={`${line}-${index}`} className='product-detail-point'>
                    {line}
                  </Text>
                ))
              ) : (
                <Text className='product-detail-empty'>暂无分析结果，稍后下拉刷新查看</Text>
              )}
            </View>

            {stringifyRawAnalysis(detailProduct) ? (
              <View className='product-detail-section'>
                <Text className='product-detail-label'>原始分析内容</Text>
                <ScrollView scrollY className='product-detail-raw'>
                  <Text className='product-detail-raw-text'>{stringifyRawAnalysis(detailProduct)}</Text>
                </ScrollView>
              </View>
            ) : null}

            <View className='product-modal-actions'>
              <View className='product-modal-cancel' onClick={() => setDetailProduct(null)}>
                <Text>关闭</Text>
              </View>
              <View
                className='product-modal-confirm'
                onClick={async () => {
                  const latestProducts = await loadProducts();
                  const latest = latestProducts.find((item) => item.id === detailProduct.id);
                  if (latest) setDetailProduct(latest);
                }}
              >
                <Text>刷新结果</Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
