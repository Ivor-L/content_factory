import { View, Text } from '@tarojs/components';
import Taro, { useDidShow, useLoad } from '@tarojs/taro';
import { useState } from 'react';
import { miniappApi } from '../../utils/miniapp-api';
import './index.sass';

const TABS = [
  { id: 'template', label: '模板库' },
  { id: 'role', label: '角色库' },
  { id: 'product', label: '产品库' },
  { id: 'style', label: '风格库' },
];

export default function AssetsPage() {
  const [activeTab, setActiveTab] = useState('template');
  const [overview, setOverview] = useState({
    characters: 0,
    products: 0,
    styles: 0,
    templates: 0,
  });

  useLoad((options) => {
    const rawTab = typeof options?.tab === 'string' ? options.tab : '';
    const tab = rawTab === 'knowledge' ? 'template' : rawTab;
    const allowedTabs = new Set(TABS.map((item) => item.id));
    if (allowedTabs.has(tab)) {
      setActiveTab(tab);
    }
  });

  useDidShow(() => {
    void (async () => {
      try {
        const data = await miniappApi.getAssetOverview();
        setOverview(data);
      } catch (error) {
        Taro.showToast({
          title: error instanceof Error ? error.message : '加载资产失败',
          icon: 'none',
        });
      }
    })();
  });

  const handleOpenDetail = () => {
    switch (activeTab) {
      case 'role':
        Taro.navigateTo({ url: '/pages/warehouse/index' });
        break;
      case 'template':
        Taro.showToast({ title: '模板库开发中', icon: 'none' });
        break;
      case 'product':
        Taro.showToast({ title: '产品库开发中', icon: 'none' });
        break;
      case 'style':
        Taro.showToast({ title: '风格库开发中', icon: 'none' });
        break;
      default:
        break;
    }
  };

  const getStat = (tab) => {
    if (tab === 'role') return overview.characters;
    if (tab === 'product') return overview.products;
    if (tab === 'style') return overview.styles;
    return overview.templates;
  };

  const handleBack = () => {
    const pages = Taro.getCurrentPages();
    if (pages.length > 1) {
      Taro.navigateBack({ delta: 1 });
      return;
    }
    Taro.switchTab({ url: '/pages/home/index' });
  };

  return (
    <View className='assets-page'>
      <View className='assets-header'>
        <View className='assets-topbar'>
          <View className='assets-back' onClick={handleBack}>
            <Text className='assets-back-text'>‹</Text>
          </View>
          <Text className='assets-title'>资产管理</Text>
        </View>
        <View className='assets-tab-grid'>
          {TABS.map((tab) => (
            <View
              key={tab.id}
              className={`assets-tab ${activeTab === tab.id ? 'assets-tab--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Text className={`assets-tab-label ${activeTab === tab.id ? 'assets-tab-label--active' : ''}`}>
                {tab.label}
              </Text>
              <Text className={`assets-tab-count ${activeTab === tab.id ? 'assets-tab-count--active' : ''}`}>
                {getStat(tab.id)}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View className='assets-content'>
        <View className='assets-card'>
          <Text className='assets-card-title'>{TABS.find((item) => item.id === activeTab)?.label}</Text>
          <Text className='assets-card-desc'>
            {activeTab === 'role' && '管理数字人角色形象、音色和素材。'}
            {activeTab === 'template' && '按行业保存高复用创作模板。'}
            {activeTab === 'product' && '维护你的产品信息与卖点资料。'}
            {activeTab === 'style' && '管理文案与图文的风格预设。'}
          </Text>

          <View className='assets-card-action' onClick={handleOpenDetail}>
            <Text className='assets-card-action-text'>进入{TABS.find((item) => item.id === activeTab)?.label}</Text>
          </View>
        </View>

        <View className='assets-shortcuts'>
          <View className='assets-shortcut-item'>
            <Text className='assets-shortcut-title'>角色</Text>
            <Text className='assets-shortcut-value'>{overview.characters}</Text>
          </View>
          <View className='assets-shortcut-item'>
            <Text className='assets-shortcut-title'>产品</Text>
            <Text className='assets-shortcut-value'>{overview.products}</Text>
          </View>
          <View className='assets-shortcut-item'>
            <Text className='assets-shortcut-title'>风格</Text>
            <Text className='assets-shortcut-value'>{overview.styles}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
