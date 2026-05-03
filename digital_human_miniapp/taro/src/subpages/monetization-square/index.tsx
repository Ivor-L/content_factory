import { View, Text, ScrollView, Image } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useMemo, useState } from 'react';
import { miniappApi } from '../../utils/miniapp-api';
import type { MonetizationSquareConfigPayload, MonetizationItemConfig } from '../../utils/miniapp-api';
import channelsMarkIcon from '../../assets/icons/shipinhao.png';
import './index.sass';

declare const wx: {
  openChannelsActivity?: (options: {
    finderUserName: string;
    feedId: string;
    success?: () => void;
    fail?: (err?: unknown) => void;
    complete?: () => void;
  }) => void;
};

const MONETIZATION_TABS = [
  { id: 'creation', label: '创作变现' },
  { id: 'share', label: '分享变现' },
] as const;

type MonetizationTabId = (typeof MONETIZATION_TABS)[number]['id'];

type ShareVideoItem = {
  id: string;
  title: string;
  coverImageUrl?: string;
  likesText: string;
  finderUserName: string;
  feedId: string;
};

type ShareVideoSection = {
  id: string;
  title: string;
  items: ShareVideoItem[];
};

function isShareCategory(id: string, name: string): boolean {
  const normalizedId = String(id || '').trim().toLowerCase();
  const normalizedName = String(name || '').trim();
  return normalizedId.startsWith('share-') || normalizedId.startsWith('share_') || normalizedName.startsWith('分享');
}

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
  const [activeTab, setActiveTab] = useState<MonetizationTabId>('creation');

  useDidShow(() => {
    void (async () => {
      setLoading(true);
      try {
        const data = await miniappApi.getMonetizationSquareConfig('default');
        setConfig(data);
        const creationCategories = data.categories.filter((item) => !isShareCategory(item.id, item.name));
        setActiveCategoryId((prev) => {
          if (prev && creationCategories.some((c) => c.id === prev)) return prev;
          return creationCategories[0]?.id || '';
        });
        setErrorText('');
      } catch (error) {
        setErrorText(error instanceof Error ? error.message : '加载失败');
      } finally {
        setLoading(false);
      }
    })();
  });

  const creationCategories = useMemo(
    () => (config?.categories || []).filter((item) => !isShareCategory(item.id, item.name)),
    [config],
  );

  const activeCategory = useMemo(() => {
    if (creationCategories.length === 0) return null;
    return creationCategories.find((item) => item.id === activeCategoryId) || creationCategories[0] || null;
  }, [creationCategories, activeCategoryId]);

  const shareSections = useMemo<ShareVideoSection[]>(() => {
    if (!config) return [];

    return config.categories
      .filter((category) => isShareCategory(category.id, category.name))
      .map((category) => {
        const cards = category.items.flatMap((item) => {
          const sourceDemos = Array.isArray(item.demos) && item.demos.length > 0
            ? item.demos
            : [{
              id: item.id,
              title: item.title,
              coverImageUrl: item.coverImageUrl,
              action: item.action,
            }];

          return sourceDemos
            .map((demo) => {
              const action = demo.action || item.action;
              const params = action?.params || {};
              const finderUserName = String(params.finderUserName || '').trim();
              const feedId = String(params.feedId || '').trim();
              if (!finderUserName || !feedId) return null;

              return {
                id: `${category.id}-${item.id}-${demo.id}`,
                title: String(demo.title || item.title || '未命名视频'),
                coverImageUrl: String(demo.coverImageUrl || item.coverImageUrl || '').trim() || undefined,
                likesText: String(params.likesText || '10万+'),
                finderUserName,
                feedId,
              };
            })
            .filter(Boolean) as ShareVideoItem[];
        });

        return {
          id: category.id,
          title: String(category.name || '分享').replace(/^分享[:：\s-]*/, '').trim() || '分享',
          items: cards,
        };
      })
      .filter((section) => section.items.length > 0);
  }, [config]);

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

  const handleOpenShareVideo = (item: ShareVideoItem) => {
    const finderUserName = String(item.finderUserName || '').trim();
    const feedId = String(item.feedId || '').trim();
    if (!finderUserName || !feedId) {
      Taro.showToast({ title: '未配置视频号参数', icon: 'none' });
      return;
    }

    if (typeof wx === 'undefined' || typeof wx.openChannelsActivity !== 'function') {
      Taro.showToast({ title: '当前基础库不支持视频号视频', icon: 'none' });
      return;
    }

    wx.openChannelsActivity({
      finderUserName,
      feedId,
      fail: () => {
        Taro.showToast({ title: '视频号视频打开失败', icon: 'none' });
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
        <View className='monetization-topbar'>
          <View className='monetization-back' onClick={handleBack}>
            <Text className='monetization-back-text'>‹</Text>
          </View>
          <Text className='monetization-nav-title'>{config?.title || '变现广场'}</Text>
          <View className='monetization-nav-spacer' />
        </View>

        <View className='monetization-top-switch-tabs'>
          {MONETIZATION_TABS.map((tab) => (
            <View
              key={tab.id}
              className={`monetization-top-switch-tab ${activeTab === tab.id ? 'monetization-top-switch-tab--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Text className='monetization-top-switch-label'>{tab.label}</Text>
              {activeTab === tab.id && <View className='monetization-top-switch-underline' />}
            </View>
          ))}
        </View>
      </View>

      <View className='monetization-body'>
        {activeTab === 'creation' && (
          <>
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
                    {creationCategories.map((category) => {
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
          </>
        )}

        {activeTab === 'share' && (
          <ScrollView scrollY className='monetization-share-scroll'>
            <View className='monetization-share-list'>
              {shareSections.map((section) => (
                <View key={section.id} className='monetization-share-section'>
                  <View className='monetization-section-head'>
                    <Text className='monetization-section-title'>{section.title}</Text>
                  </View>

                  <ScrollView scrollX className='monetization-share-scroll-row' showScrollbar={false}>
                    <View className='monetization-share-card-list'>
                      {section.items.map((item) => (
                        <View
                          key={item.id}
                          className='monetization-share-card'
                          onClick={() => handleOpenShareVideo(item)}
                        >
                          <View className='monetization-share-card-media'>
                            {!!item.coverImageUrl && (
                              <Image className='monetization-share-card-cover' src={item.coverImageUrl} mode='aspectFill' />
                            )}
                            <View className='monetization-share-card-overlay'>
                              <Text className='monetization-share-card-title'>{item.title}</Text>
                              <View className='monetization-share-card-stats'>
                                <Image className='monetization-share-mark' src={channelsMarkIcon} mode='aspectFit' />
                                <Text className='monetization-share-likes'>{item.likesText}</Text>
                              </View>
                            </View>
                          </View>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              ))}
              {!loading && shareSections.length === 0 && (
                <View className='monetization-state'>
                  <Text className='monetization-state-text'>暂无分享内容，请在配置中心新增 `share-` 分类并填写 finderUserName/feedId。</Text>
                </View>
              )}
            </View>
          </ScrollView>
        )}
      </View>
    </View>
  );
}
