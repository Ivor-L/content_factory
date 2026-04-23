'use client';

import { useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

type Params = Record<string, string | number>;

const FALLBACK_ZH: Record<string, string> = {
  'docPreview.wechatPreviewTitle': '公众号排版预览',
  'docPreview.wechatPreviewDesc': '支持主题、字体缩放与导出。',
  'docPreview.wechatShowTitle': '显示标题',
  'docPreview.wechatResetDraft': '重置草稿',
  'docPreview.wechatPreviewScale': '字号缩放',
  'docPreview.wechatThemeTitle': '主题',
  'docPreview.wechatThemeEdit': '编辑主题',
  'docPreview.wechatThemeCollapse': '收起主题',
  'docPreview.wechatThemePresets': '预设主题',
  'docPreview.wechatThemeCustomList': '自定义主题',
  'docPreview.wechatThemeCustomEmpty': '暂无自定义主题',
  'docPreview.wechatThemeNamePlaceholder': '主题名称',
  'docPreview.wechatThemeSave': '保存',
  'docPreview.wechatThemeUpdate': '更新',
  'docPreview.wechatThemeResetColors': '重置颜色',
  'docPreview.wechatThemeDelete': '删除',
  'docPreview.wechatCopyHtml': '复制 HTML',
  'docPreview.wechatCopiedHtml': '已复制',
  'docPreview.wechatExportMarkdown': '导出 Markdown',
  'docPreview.wechatExportHtml': '导出 HTML',

  'docPreview.textCardTitle': '小红书图文排版',
  'docPreview.textCardDesc': '支持模板、封面、分页导出。',
  'docPreview.textCardTemplate': '模板',
  'docPreview.textCardResolution': '分辨率',
  'docPreview.textCardPageCount': '页数',
  'docPreview.textCardFormat': '导出格式',
  'docPreview.textCardEmpty': '暂无预览内容',
  'docPreview.textCardPrev': '上一页',
  'docPreview.textCardNext': '下一页',
  'docPreview.textCardPageIndicator': '{{current}} / {{total}}',
  'docPreview.textCardExportCurrent': '导出当前页',
  'docPreview.textCardExportAll': '导出全部',

  'skills.placeholder': '请输入内容',
};

const FALLBACK_EN: Record<string, string> = {
  'docPreview.wechatPreviewTitle': 'WeChat Layout Preview',
  'docPreview.wechatPreviewDesc': 'Theme, font scale and export.',
  'docPreview.wechatShowTitle': 'Show title',
  'docPreview.wechatResetDraft': 'Reset draft',
  'docPreview.wechatPreviewScale': 'Font scale',
  'docPreview.wechatThemeTitle': 'Theme',
  'docPreview.wechatThemeEdit': 'Edit Theme',
  'docPreview.wechatThemeCollapse': 'Collapse Theme',
  'docPreview.wechatThemePresets': 'Presets',
  'docPreview.wechatThemeCustomList': 'Custom Themes',
  'docPreview.wechatThemeCustomEmpty': 'No custom themes',
  'docPreview.wechatThemeNamePlaceholder': 'Theme name',
  'docPreview.wechatThemeSave': 'Save',
  'docPreview.wechatThemeUpdate': 'Update',
  'docPreview.wechatThemeResetColors': 'Reset colors',
  'docPreview.wechatThemeDelete': 'Delete',
  'docPreview.wechatCopyHtml': 'Copy HTML',
  'docPreview.wechatCopiedHtml': 'Copied',
  'docPreview.wechatExportMarkdown': 'Export Markdown',
  'docPreview.wechatExportHtml': 'Export HTML',

  'docPreview.textCardTitle': 'XHS Text Card Layout',
  'docPreview.textCardDesc': 'Templates, cover, pagination export.',
  'docPreview.textCardTemplate': 'Template',
  'docPreview.textCardResolution': 'Resolution',
  'docPreview.textCardPageCount': 'Pages',
  'docPreview.textCardFormat': 'Format',
  'docPreview.textCardEmpty': 'No preview yet',
  'docPreview.textCardPrev': 'Prev',
  'docPreview.textCardNext': 'Next',
  'docPreview.textCardPageIndicator': '{{current}} / {{total}}',
  'docPreview.textCardExportCurrent': 'Export Current',
  'docPreview.textCardExportAll': 'Export All',

  'skills.placeholder': 'Enter content',
};

function formatMessage(template: string, params?: Params) {
  if (!params) return template;
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => {
    const value = params[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

export function useTranslation() {
  const { language } = useLanguage();
  const locale = language === 'en' ? 'en' : 'zh';

  const dict = useMemo(() => (locale === 'en' ? FALLBACK_EN : FALLBACK_ZH), [locale]);

  const t = (key: string, params?: Params) => {
    const value = dict[key] || (locale === 'en' ? FALLBACK_ZH[key] : FALLBACK_EN[key]) || key;
    return formatMessage(value, params);
  };

  return { t, locale };
}
