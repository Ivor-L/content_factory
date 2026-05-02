import { View, Text, Input, ScrollView, Image } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useMemo, useState } from 'react';
import { miniappApi } from '../../utils/miniapp-api';
import './index.sass';

const CATEGORIES = ['全行业', '保险', '法律', '金融', '教育', '心理', 'AI', '餐饮', '美业'];
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

export default function HotSquarePage() {
  const [activeCategory, setActiveCategory] = useState('全行业');
  const [activeFilter, setActiveFilter] = useState<'all' | 'video' | 'image'>('all');
  const [activeSort, setActiveSort] = useState<'recent' | 'likes' | 'collects'>('recent');
  const [keyword, setKeyword] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [failedCoverIds, setFailedCoverIds] = useState<string[]>([]);

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
      });
      setList(data);
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
    setSearchHistory(readSearchHistory());
    const defaultFilter = Taro.getStorageSync('HOT_SQUARE_DEFAULT_FILTER');
    if (defaultFilter === 'video' || defaultFilter === 'image' || defaultFilter === 'all') {
      Taro.removeStorageSync('HOT_SQUARE_DEFAULT_FILTER');
      setActiveFilter(defaultFilter);
      void loadList(activeCategory, keyword, defaultFilter, activeSort);
      return;
    }
    void loadList();
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
      const currentIndex = TYPE_FILTER_OPTIONS.findIndex((item) => item.id === activeFilter);
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
    const payload = {
      ...item,
      title: typeof item?.title === 'string' ? item.title : '未命名内容',
    };
    Taro.setStorageSync('HOT_DETAIL_ITEM', payload);
    Taro.navigateTo({ url: `/pages/hot-detail/index?id=${encodeURIComponent(String(item?.id ?? ''))}` });
  };

  return (
    <View className='hot-square-page'>
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
            {CATEGORIES.map((item) => (
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
                  {item.category && (
                    <View className='hot-badge'>
                      <Text className='hot-badge-text'>{item.category}</Text>
                    </View>
                  )}
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

          {!loading && list.length === 0 && (
            <View className='hot-empty'>
              <Text className='hot-empty-text'>暂无内容，换个关键词试试</Text>
            </View>
          )}
        </View>
      </ScrollView>
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
