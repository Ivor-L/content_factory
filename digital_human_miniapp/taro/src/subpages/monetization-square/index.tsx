import { View, Text, ScrollView, Image } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useMemo, useState } from 'react';
import { miniappApi } from '../../utils/miniapp-api';
import type { MonetizationSquareConfigPayload, MonetizationItemConfig } from '../../utils/miniapp-api';
import './index.sass';

function buildRoute(route: string, params?: Record<string, string | number | boolean | null>): string {
  const cleanRoute = String(route || '').trim();
  if (!cleanRoute) return '';
  if (!params || Object.keys(params).length === 0) return cleanRoute;
  const qs = Object.entries(params)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
  if (!qs) return cleanRoute;
  return cleanRoute.includes('?') ? `${cleanRoute}&${qs}` : `${cleanRoute}?${qs}`;
}

export default function MonetizationSquarePage() {
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState('');
  const [config, setConfig] = useState<MonetizationSquareConfigPayload | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState('');

  useDidShow(() => {
    void (async () => {
      setLoading(true);
      try {
        const data = await miniappApi.getMonetizationSquareConfig('default');
        setConfig(data);
        setActiveCategoryId((prev) => {
          if (prev && data.categories.some((c) => c.id === prev)) return prev;
          return data.categories[0]?.id || '';
        });
        setErrorText('');
      } catch (error) {
        setErrorText(error instanceof Error ? error.message : '加载失败');
      } finally {
        setLoading(false);
      }
    })();
  });

  const activeCategory = useMemo(() => {
    if (!config) return null;
    return config.categories.find((item) => item.id === activeCategoryId) || config.categories[0] || null;
  }, [config, activeCategoryId]);

  const handleBack = () => {
    const pages = Taro.getCurrentPages();
    if (pages.length > 1) {
      Taro.navigateBack({ delta: 1 });
      return;
    }
    Taro.switchTab({ url: '/pages/home/index' });
  };

  const handleOpenItem = (item: MonetizationItemConfig) => {
    const action = item.action;
    if (action.type !== 'route') {
      Taro.showToast({ title: '暂不支持该动作类型', icon: 'none' });
      return;
    }

    const targetUrl = buildRoute(action.route, action.params);
    if (!targetUrl) {
      Taro.showToast({ title: '未配置跳转地址', icon: 'none' });
      return;
    }

    Taro.navigateTo({
      url: targetUrl,
      fail: () => {
        Taro.showToast({ title: '页面跳转失败', icon: 'none' });
      },
    });
  };

  const groupedItems = useMemo(() => {
    const items = activeCategory?.items || [];
    return items.map((item) => {
      const demos = Array.isArray(item.demos) && item.demos.length > 0
        ? item.demos.map((demo) => ({
          id: demo.id,
          title: demo.title,
          subtitle: demo.subtitle,
          coverImageUrl: demo.coverImageUrl,
          demoVideoUrl: demo.demoVideoUrl,
          tags: demo.tags,
          action: demo.action || item.action,
        }))
        : [{
          id: item.id,
          title: item.title,
          subtitle: item.subtitle,
          coverImageUrl: item.coverImageUrl,
          demoVideoUrl: item.demoVideoUrl,
          tags: item.tags,
          action: item.action,
        }];

      return {
        id: item.id,
        name: item.title,
        demos,
      };
    });
  }, [activeCategory]);

  return (
    <View className='monetization-page'>
      <View className='monetization-nav'>
        <View className='monetization-back' onClick={handleBack}>
          <Text className='monetization-back-text'>‹</Text>
        </View>
        <Text className='monetization-nav-title'>{config?.title || '变现广场'}</Text>
        <View className='monetization-nav-spacer' />
      </View>

      <View className='monetization-body'>
        {!!config?.subtitle && <Text className='monetization-subtitle'>{config.subtitle}</Text>}

        {loading && (
          <View className='monetization-state'>
            <Text className='monetization-state-text'>加载中...</Text>
          </View>
        )}

        {!loading && !!errorText && (
          <View className='monetization-state'>
            <Text className='monetization-state-text'>{errorText}</Text>
          </View>
        )}

        {!loading && !errorText && !!config && (
          <>
            <ScrollView scrollX className='monetization-tab-scroll'>
              <View className='monetization-tab-list'>
                {config.categories.map((category) => {
                  const active = (activeCategory?.id || '') === category.id;
                  return (
                    <View
                      key={category.id}
                      className={`monetization-tab ${active ? 'monetization-tab--active' : ''}`}
                      onClick={() => setActiveCategoryId(category.id)}
                    >
                      <Text className={`monetization-tab-text ${active ? 'monetization-tab-text--active' : ''}`}>{category.name}</Text>
                    </View>
                  );
                })}
              </View>
            </ScrollView>

            <ScrollView scrollY className='monetization-content-scroll'>
              <View className='monetization-group-list'>
                {groupedItems.map((group) => (
                  <View key={group.id} className='monetization-section'>
                    <View className='monetization-section-head'>
                      <Text className='monetization-section-title'>{group.name}</Text>
                    </View>

                    <ScrollView scrollX className='monetization-demo-scroll' showScrollbar={false}>
                      <View className='monetization-demo-list'>
                        {group.demos.map((demo) => (
                          <View
                            key={`${group.id}-${demo.id}`}
                            className='monetization-card'
                            onClick={() => handleOpenItem({
                              id: demo.id,
                              title: demo.title,
                              subtitle: demo.subtitle,
                              coverImageUrl: demo.coverImageUrl,
                              demoVideoUrl: demo.demoVideoUrl,
                              tags: demo.tags,
                              action: demo.action,
                            })}
                          >
                            <View className='monetization-card-media'>
                              {!!demo.coverImageUrl ? (
                                <Image className='monetization-card-cover' src={demo.coverImageUrl} mode='aspectFill' />
                              ) : (
                                <View className='monetization-card-fallback'>
                                  <Text className='monetization-card-fallback-text'>{demo.title.slice(0, 4)}</Text>
                                </View>
                              )}
                            </View>
                            <View className='monetization-card-body'>
                              <View className='monetization-card-footer'>
                                <Text className='monetization-card-title'>{demo.title}</Text>
                                <View className='monetization-card-btn'>
                                  <Text className='monetization-card-btn-text'>做同款</Text>
                                </View>
                              </View>
                            </View>
                          </View>
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                ))}
              </View>
            </ScrollView>
          </>
        )}
      </View>
    </View>
  );
}
