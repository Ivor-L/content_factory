import { View, Text, Input, ScrollView, Image } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useMemo, useState } from 'react';
import { miniappApi } from '../../utils/miniapp-api';
import './index.sass';

const CATEGORIES = ['全行业', '保险', '法律', '金融', '教育', '心理', 'AI', '餐饮', '美业'];

export default function HotSquarePage() {
  const [activeCategory, setActiveCategory] = useState('全行业');
  const [keyword, setKeyword] = useState('');
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadList = async (category = activeCategory, q = keyword) => {
    setLoading(true);
    try {
      const data = await miniappApi.getHotList({ category, q, limit: 20 });
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
    void loadList();
  });

  const summaryText = useMemo(() => {
    if (loading) return '加载中...';
    return `共 ${list.length} 条爆款内容`;
  }, [list.length, loading]);

  const handleSearch = () => {
    void loadList(activeCategory, keyword);
  };

  const handleCategoryChange = (category) => {
    setActiveCategory(category);
    void loadList(category, keyword);
  };

  const handleOneClickCreate = async (item) => {
    try {
      const result = await miniappApi.startOneClickCreate(item);
      Taro.showToast({ title: '已创建任务', icon: 'success' });
      setTimeout(() => {
        Taro.switchTab({ url: '/pages/works/index' });
      }, 500);
      console.log('one click create task:', result.taskId, result.status);
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '创建失败',
        icon: 'none',
      });
    }
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
            confirmType='search'
            onConfirm={handleSearch}
          />
          <View className='hot-search-btn' onClick={handleSearch}>
            <Text className='hot-search-btn-text'>搜索</Text>
          </View>
        </View>
        <ScrollView scrollX className='hot-category-scroll'>
          <View className='hot-category-list'>
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
        {list.map((item) => (
          <View key={item.id} className='hot-card'>
            <View className='hot-cover'>
              {item.coverUrl ? (
                <Image className='hot-cover-image' src={item.coverUrl} mode='aspectFill' />
              ) : (
                <Text className='hot-cover-placeholder'>爆款</Text>
              )}
              {item.category && (
                <View className='hot-badge'>
                  <Text className='hot-badge-text'>{item.category}</Text>
                </View>
              )}
            </View>

            <View className='hot-body'>
              <Text className='hot-item-title'>{item.title}</Text>
              <Text className='hot-item-desc' numberOfLines={2}>
                {item.description || item.scriptText || '点击一键同款创作，快速生成你的图文内容'}
              </Text>

              <View className='hot-meta-row'>
                <Text className='hot-meta-author'>{item.creatorName || '匿名作者'}</Text>
                <Text className='hot-meta-score'>热度 {item.benchmarkScore ?? '--'}</Text>
              </View>

              <View className='hot-create-btn' onClick={() => handleOneClickCreate(item)}>
                <Text className='hot-create-btn-text'>一键同款创作</Text>
              </View>
            </View>
          </View>
        ))}

        {!loading && list.length === 0 && (
          <View className='hot-empty'>
            <Text className='hot-empty-text'>暂无内容，换个关键词试试</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
