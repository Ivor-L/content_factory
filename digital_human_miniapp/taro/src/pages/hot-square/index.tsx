import { View, Text, Input, ScrollView, Image } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useMemo, useState } from 'react';
import { miniappApi, type HotSquareCategoryConfig } from '../../utils/miniapp-api';
import './index.sass';

const DEFAULT_REMOTE_CATEGORIES = ['保险', '法律', '金融', '教育', '心理', 'AI', '餐饮', '美业'];
const BASE_CATEGORIES = ['我的', '全行业'];
const HOT_COVER_FALLBACK_URL = 'https://oss.atomx.top/miniapp/hot-square/fallback-cover-1777628403821.jpg';
const TYPE_FILTER_OPTIONS: Array<{ id: 'all' | 'video' | 'image'; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'video', label: '视频' },
  { id: 'image', label: '图文' },
];
const SORT_OPTIONS: Array<{ id: 'recent' | 'likes' | 'collects'; label: string }> = [
  { id: 'recent', label: '最新' },
  { id: 'likes', label: '点赞最多' },
  { id: 'collects', label: '收藏最多' },
];
const SEARCH_HISTORY_KEY = 'HOT_SEARCH_HISTORY';
const SEARCH_HISTORY_MAX = 10;
const HOT_REMOVED_ITEMS_KEY = 'HOT_SQUARE_REMOVED_ITEMS';

export default function HotSquarePage() {
  const [activeCategory, setActiveCategory] = useState('我的');
  const [dynamicCategories, setDynamicCategories] = useState<string[]>(DEFAULT_REMOTE_CATEGORIES);
  const [activeFilter, setActiveFilter] = useState<'all' | 'video' | 'image'>('all');
  const [activeSort, setActiveSort] = useState<'recent' | 'likes' | 'collects'>('recent');
  const [keyword, setKeyword] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [failedCoverIds, setFailedCoverIds] = useState<string[]>([]);
  const [collectVisible, setCollectVisible] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [collectUrl, setCollectUrl] = useState('');

  const isBlockedCover = (url?: string | null) => {
    if (!url) return false;
    try {
      const { hostname } = new URL(url);
      return /instagram|fbcdn/i.test(hostname);
    } catch {
      return false;
    }
  };

  const isVideoItem = (item: any) => {
    const sourceType = String(item?.sourceType ?? '').toLowerCase();
    if (sourceType.includes('video')) return true;
    const videoUrl = String(item?.videoUrl ?? '').trim();
    if (videoUrl) return true;
    const cover = String(item?.coverUrl ?? '');
    return /\/spectrum\/1040g0k0/i.test(cover);
  };

  const getCoverRatioClass = (item: any, index: number) => {
    if (isVideoItem(item)) return 'hot-cover--ratio-4x5';
    const pattern = ['hot-cover--ratio-1x1', 'hot-cover--ratio-4x5', 'hot-cover--ratio-3x4'];
    return pattern[index % pattern.length];
  };

  const formatLikes = (value?: number | null) => {
    if (typeof value !== 'number' || Number.isNaN(value) || value < 0) return '--';
    if (value > 10000) return `${(value / 10000).toFixed(1)}万`;
    return String(Math.round(value));
  };

  const loadList = async (
    category = activeCategory,
    q = keyword,
    filter = activeFilter,
    sort = activeSort,
  ) => {
    setLoading(true);
    try {
      const data = await miniappApi.getHotList({
        category,
        q,
        limit: 40,
        sort,
        contentType: filter === 'video' ? 'video' : (filter === 'image' ? 'image' : undefined),
        source: category === '我的' ? 'mine' : 'all',
      });
      setList(data.filter((item) => !isRemovedHotItem(item)));
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '加载失败',
        icon: 'none',
      });
    } finally {
      setLoading(false);
    }
  };

  useDidShow(() => {
    const boot = async () => {
      setList((prev) => prev.filter((item) => !isRemovedHotItem(item)));
      setSearchHistory(readSearchHistory());
      try {
        const config = await miniappApi.getHotSquareConfig();
        const list = Array.isArray(config.categories)
          ? config.categories
            .filter((item: HotSquareCategoryConfig) => item?.enabled !== false)
            .map((item: HotSquareCategoryConfig) => String(item.name || '').trim())
            .filter(Boolean)
          : [];
        if (list.length > 0) {
          setDynamicCategories(list);
        } else {
          setDynamicCategories(DEFAULT_REMOTE_CATEGORIES);
        }
      } catch {
        setDynamicCategories(DEFAULT_REMOTE_CATEGORIES);
      }

      const defaultFilter = Taro.getStorageSync('HOT_SQUARE_DEFAULT_FILTER');
      if (defaultFilter === 'video' || defaultFilter === 'image' || defaultFilter === 'all') {
        Taro.removeStorageSync('HOT_SQUARE_DEFAULT_FILTER');
        setActiveFilter(defaultFilter);
        await loadList(activeCategory, keyword, defaultFilter, activeSort);
        return;
      }
      await loadList();
    };
    void boot();
  });

  const summaryText = useMemo(() => {
    if (loading) return '加载中...';
    return `共 ${list.length} 条爆款内容`;
  }, [list.length, loading]);

  const handleSearch = () => {
    const nextKeyword = keyword.trim();
    if (nextKeyword) {
      const nextHistory = updateSearchHistory(nextKeyword);
      setSearchHistory(nextHistory);
      setKeyword(nextKeyword);
    }
    setSearchFocused(false);
    void loadList(activeCategory, nextKeyword, activeFilter, activeSort);
  };

  const handleCategoryChange = (category: string) => {
    setActiveCategory(category);
    void loadList(category, keyword, activeFilter, activeSort);
  };

  const handleFilterChange = async () => {
    try {
      const result = await Taro.showActionSheet({
        itemList: TYPE_FILTER_OPTIONS.map((item) => item.label),
      });
      const nextFilter = TYPE_FILTER_OPTIONS[result.tapIndex]?.id ?? activeFilter;
      if (nextFilter === activeFilter) return;
      setActiveFilter(nextFilter);
      void loadList(activeCategory, keyword, nextFilter, activeSort);
    } catch {
      // cancel
    }
  };

  const handleSortChange = async () => {
    try {
      const result = await Taro.showActionSheet({
        itemList: SORT_OPTIONS.map((item) => item.label),
      });
      const nextSort = SORT_OPTIONS[result.tapIndex]?.id ?? activeSort;
      if (nextSort === activeSort) return;
      setActiveSort(nextSort);
      void loadList(activeCategory, keyword, activeFilter, nextSort);
    } catch {
      // cancel
    }
  };

  const handleHistoryClick = (historyKeyword: string) => {
    setKeyword(historyKeyword);
    setSearchFocused(false);
    void loadList(activeCategory, historyKeyword, activeFilter, activeSort);
  };

  const handleOpenDetail = (item: any) => {
    const pages = Taro.getCurrentPages();
    const useRedirect = pages.length >= 9;

    if (item?.source === 'mine') {
      const myTaskId = String(item?.myTaskId || '').trim();
      if (myTaskId) {
        const url = `/subpages/hot-detail/index?myTaskId=${encodeURIComponent(myTaskId)}&mode=my`;
        const nav = useRedirect ? Taro.redirectTo : Taro.navigateTo;
        nav({
          url,
          fail: (error) => {
            console.error('[hot-square] open my detail failed', error);
            Taro.showToast({ title: '打开失败，请重试', icon: 'none' });
          },
        });
        return;
      }
    }

    const payload = {
      ...item,
      title: typeof item?.title === 'string' ? item.title : '未命名内容',
    };
    Taro.setStorageSync('HOT_DETAIL_ITEM', payload);
    const url = `/subpages/hot-detail/index?id=${encodeURIComponent(String(item?.id ?? ''))}`;
    const nav = useRedirect ? Taro.redirectTo : Taro.navigateTo;
    nav({
      url,
      fail: (error) => {
        console.error('[hot-square] open detail failed', error);
        Taro.showToast({ title: '打开失败，请重试', icon: 'none' });
      },
    });
  };

  const handleOpenCollect = async () => {
    setCollectVisible(true);
    if (collectUrl.trim()) return;

    try {
      const clip = await Taro.getClipboardData();
      const text = String(clip?.data || '').trim();
      if (text) {
        setCollectUrl(text);
      }
    } catch {
      // ignore
    }
  };

  const handlePasteClipboard = async () => {
    try {
      const clip = await Taro.getClipboardData();
      const text = String(clip?.data || '').trim();
      if (!text) {
        Taro.showToast({ title: '剪贴板为空', icon: 'none' });
        return;
      }
      setCollectUrl(text);
    } catch {
      Taro.showToast({ title: '读取剪贴板失败', icon: 'none' });
    }
  };

  const handleCloseCollect = () => {
    if (collecting) return;
    setCollectVisible(false);
  };

  const handleSubmitCollect = async () => {
    const url = collectUrl.trim();
    if (!url) {
      Taro.showToast({ title: '请先粘贴链接', icon: 'none' });
      return;
    }

    setCollecting(true);
    try {
      const result = await miniappApi.collectHotXhsNote(url);
      Taro.showToast({ title: result.message || '采集成功', icon: 'success' });
      setCollectVisible(false);
      setCollectUrl('');
      setActiveCategory('我的');
      await loadList('我的', '', activeFilter, 'recent');
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '采集失败',
        icon: 'none',
      });
    } finally {
      setCollecting(false);
    }
  };

  const categories = useMemo(() => [...BASE_CATEGORIES, ...dynamicCategories], [dynamicCategories]);

  return (
    <View className={`hot-square-page ${searchFocused && searchHistory.length > 0 ? 'hot-square-page--with-hints' : ''}`}>
      <View className='hot-header'>
        <Text className='hot-title'>爆款广场</Text>
        <View className='hot-search-row'>
          <Input
            className='hot-search-input'
            value={keyword}
            placeholder='搜索爆款灵感...'
            onInput={(e) => setKeyword(e.detail.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => {
              setTimeout(() => {
                setSearchFocused(false);
              }, 120);
            }}
            confirmType='search'
            onConfirm={handleSearch}
          />
          {searchFocused ? (
            <View className='hot-search-btn' onClick={handleSearch}>
              <Text className='hot-search-btn-text'>搜索</Text>
            </View>
          ) : (
            <View className='hot-sort-btn' onClick={handleSortChange}>
              <View className='hot-filter-icon'>
                <View className='hot-filter-icon-top' />
                <View className='hot-filter-icon-left' />
                <View className='hot-filter-icon-right' />
                <View className='hot-filter-icon-stem' />
              </View>
            </View>
          )}
        </View>
        {searchFocused && searchHistory.length > 0 && (
          <ScrollView scrollX className='hot-hints-scroll'>
            <View className='hot-hints-list'>
              {searchHistory.map((historyKeyword) => (
                <View key={historyKeyword} className='hot-hint-chip' onClick={() => handleHistoryClick(historyKeyword)}>
                  <Text className='hot-hint-chip-text'>{historyKeyword}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        )}
        <ScrollView scrollX className='hot-category-scroll'>
          <View className='hot-category-list'>
            <View className='hot-type-chip' onClick={handleFilterChange}>
              <Text className='hot-type-chip-text'>
                {TYPE_FILTER_OPTIONS.find((item) => item.id === activeFilter)?.label || '全部'}
              </Text>
            </View>
            {categories.map((item) => (
              <View
                key={item}
                className={`hot-category-chip ${activeCategory === item ? 'hot-category-chip--active' : ''}`}
                onClick={() => handleCategoryChange(item)}
              >
                <Text className={`hot-category-text ${activeCategory === item ? 'hot-category-text--active' : ''}`}>
                  {item}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      <View className='hot-summary'>
        <Text className='hot-summary-text'>{summaryText}</Text>
      </View>

      <ScrollView scrollY className='hot-list-scroll'>
        {list.length > 0 ? (
          <View className='hot-list-content'>
            {list.map((item, index) => {
              const itemId = String(item.id);
              const rawCover = typeof item.coverUrl === 'string' ? item.coverUrl : null;
              const shouldFallback = failedCoverIds.includes(itemId) || isBlockedCover(rawCover);
              const coverSrc = shouldFallback ? HOT_COVER_FALLBACK_URL : (rawCover as string);
              const isVideo = isVideoItem(item);

              return (
                <View
                  key={item.id}
                  className='hot-card'
                  onClick={() => handleOpenDetail(item)}
                >
                  <View className={`hot-cover ${getCoverRatioClass(item, index)}`}>
                    <Image
                      className='hot-cover-image'
                      src={coverSrc}
                      mode='aspectFill'
                      onError={() => {
                        if (!failedCoverIds.includes(itemId)) {
                          setFailedCoverIds((prev) => prev.concat(itemId));
                        }
                      }}
                    />
                    {isVideo && (
                      <View className='hot-video-icon'>
                        <Text className='hot-video-icon-text'>▶</Text>
                      </View>
                    )}
                  </View>

                  <View className='hot-body'>
                    <Text className='hot-item-title'>{item.title}</Text>
                    <View className='hot-meta-row'>
                      <Text className='hot-meta-author'>{item.creatorName || '匿名作者'}</Text>
                      <Text className='hot-meta-score'>♡ {formatLikes(item.likes)}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          !loading && (
            <View className='hot-empty'>
              <Text className='hot-empty-text'>暂无内容，换个关键词试试</Text>
            </View>
          )
        )}
      </ScrollView>

      <View className='hot-collect-fab' onClick={handleOpenCollect}>
        <Text className='hot-collect-fab-text'>+</Text>
      </View>

      {collectVisible && (
        <View className='hot-collect-layer'>
          <View className='hot-collect-mask' onClick={handleCloseCollect} />
          <View className='hot-collect-panel'>
            <Text className='hot-collect-title'>粘贴小红书链接</Text>
            <Input
              className='hot-collect-input'
              value={collectUrl}
              placeholder='https://www.xiaohongshu.com/explore/...'
              maxlength={1000}
              onInput={(e) => setCollectUrl(e.detail.value)}
            />
            <View className='hot-collect-actions'>
              <View className='hot-collect-action hot-collect-action--ghost' onClick={handlePasteClipboard}>
                <Text className='hot-collect-action-text hot-collect-action-text--ghost'>粘贴</Text>
              </View>
              <View className='hot-collect-action hot-collect-action--cancel' onClick={handleCloseCollect}>
                <Text className='hot-collect-action-text hot-collect-action-text--cancel'>取消</Text>
              </View>
              <View className='hot-collect-action hot-collect-action--submit' onClick={handleSubmitCollect}>
                <Text className='hot-collect-action-text'>
                  {collecting ? '采集中...' : '开始采集'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

function readSearchHistory(): string[] {
  try {
    const raw = Taro.getStorageSync(SEARCH_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
      .slice(0, SEARCH_HISTORY_MAX);
  } catch {
    return [];
  }
}

function updateSearchHistory(keyword: string): string[] {
  const current = readSearchHistory();
  const next = [keyword, ...current.filter((item) => item !== keyword)].slice(0, SEARCH_HISTORY_MAX);
  Taro.setStorageSync(SEARCH_HISTORY_KEY, JSON.stringify(next));
  return next;
}

function readRemovedHotItems(): string[] {
  try {
    const raw = Taro.getStorageSync(HOT_REMOVED_ITEMS_KEY);
    const parsed = raw ? JSON.parse(String(raw)) : [];
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item || '').trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function isRemovedHotItem(item: any): boolean {
  const removed = new Set(readRemovedHotItems());
  const keys = [
    item?.id,
    item?.myTaskId,
    item?.referenceId,
    item?.sourceUrl,
  ].map((value) => String(value || '').trim()).filter(Boolean);
  return keys.some((key) => removed.has(key));
}
