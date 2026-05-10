import { View, Text, ScrollView, Textarea, Image, Input, RichText, Swiper, SwiperItem, Picker } from '@tarojs/components';
import Taro, { useDidHide, useDidShow, useLoad } from '@tarojs/taro';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { miniappApi } from '../../utils/miniapp-api';
import { api } from '../../utils/api';
import tplImage1 from '../../assets/home-icons-v2/image.webp';
import tplImage2 from '../../assets/home-icons-v2/edit.webp';
import tplImage3 from '../../assets/home-icons-v2/copy.webp';
import tplImage4 from '../../assets/home-icons-v2/video.webp';
import tplImage5 from '../../assets/home-icons-v2/swap.webp';
import tplImage6 from '../../assets/home-icons-v2/human.webp';
import md2MeadowDawnBg from '../../assets/md2card/meadow-dawn-bg.jpeg';
import './index.sass';

type FeatureKey = 'ai-image' | 'infographic' | 'card-layout';

type InfographicTemplate = {
  id: string;
  title: string;
  tag: string;
  preview: string;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
  spec?: Record<string, unknown> | null;
};

const FEATURE_TABS: Array<{ key: FeatureKey; label: string }> = [
  { key: 'ai-image', label: 'AI作图' },
  { key: 'infographic', label: '信息图' },
  { key: 'card-layout', label: '图文卡片' },
];
const ACTION_TRANSFER_IMAGE_RETURN_KEY = 'REMIX_ACTION_SOURCE_IMAGE_URL';
const WORK_SELECT_TARGET_STORAGE_KEY = 'WORK_SELECT_TARGET';
const SMART_COPY_CARD_PAYLOAD_KEY = 'SMART_COPY_CARD_PAYLOAD';

function getApiBaseUrl(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fromDefine = typeof __API_BASE_URL__ !== 'undefined' ? String((__API_BASE_URL__ as any) || '').trim() : '';
    if (fromDefine) return fromDefine.replace(/\/$/, '');
  } catch {
    // ignore
  }
  return '';
}

function buildCardExportDownloadUrl(url: string, index: number): string {
  const filename = `xhs-card-${String(index + 1).padStart(2, '0')}.png`;
  if (!/^https?:\/\//i.test(url)) {
    return url;
  }
  const path = `/api/proxy/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
  const apiBaseUrl = getApiBaseUrl();
  return apiBaseUrl ? `${apiBaseUrl}${path}` : path;
}

function buildCardExportDownloadHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  try {
    const apiKey = String(Taro.getStorageSync('API_KEY') || '').trim();
    if (apiKey) headers['X-User-Api-Key'] = apiKey;
  } catch {
    // ignore
  }
  try {
    const token = String(Taro.getStorageSync('MINIAPP_ACCESS_TOKEN') || '').trim();
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // ignore
  }
  return headers;
}

function buildQrcodeImageSrc(text: string): string {
  const value = String(text || '').trim();
  if (!value) return '';
  if (/^https?:\/\/.+\.(png|jpe?g|webp)(\?|$)/i.test(value) || /^data:image\//i.test(value)) return value;
  const apiBaseUrl = getApiBaseUrl();
  const path = `/api/utils/qrcode?size=360&text=${encodeURIComponent(value)}`;
  return apiBaseUrl ? `${apiBaseUrl}${path}` : path;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeJsonForSubmit(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';
    try {
      return JSON.stringify(JSON.parse(trimmed));
    } catch {
      return trimmed.startsWith('{') || trimmed.startsWith('[') ? trimmed : '';
    }
  }
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function extractInfographicStyleProfile(template: InfographicTemplate | null): string {
  if (!template) return '';
  const metadata = isPlainRecord(template.metadata) ? template.metadata : null;
  const spec = isPlainRecord(template.spec) ? template.spec : null;
  const candidates = [
    metadata?.analysis,
    metadata?.style_profile_json,
    metadata?.styleProfileJson,
    metadata?.style_dna ? { style_dna: metadata.style_dna, generation_prompts: metadata.generation_prompts ?? metadata.promptKit } : null,
    spec,
    metadata,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeJsonForSubmit(candidate);
    if (normalized) return normalized;
  }
  return '';
}

function getRouteFeatureOverride(): FeatureKey | null {
  try {
    const params = (Taro.getCurrentInstance()?.router?.params || {}) as Record<string, unknown>;
    const from = String(params.from || '').trim();
    if (from === 'action-transfer') return 'ai-image';
    const targetFeature = String(params.targetFeature || '').trim();
    return targetFeature === 'infographic' || targetFeature === 'card-layout'
      ? targetFeature
      : null;
  } catch {
    return null;
  }
}

const IMAGE_MODELS = [
  { key: 'image2', name: 'GPT-image2', desc: '细节表现优秀，适合精细创作', badge: '默认', maxReferenceImages: 8 },
  { key: 'nano-banana-pro', name: 'nano-Banana-Pro-3', desc: '综合能力强，适合多种创意场景', maxReferenceImages: 8 },
];

type ImageAspectRatio = '1:1' | '3:4' | '4:3' | '9:16' | '16:9';

const IMAGE_ASPECT_OPTIONS: Array<{
  key: ImageAspectRatio;
  label: string;
  desc: string;
  size: '1024x1024' | '1536x1024' | '1024x1536';
}> = [
  { key: '9:16', label: '手机屏', desc: '短视频封面', size: '1024x1536' },
  { key: '16:9', label: '宽屏', desc: '横版场景', size: '1536x1024' },
  { key: '1:1', label: '方图', desc: '头像 / 商品图', size: '1024x1024' },
  { key: '3:4', label: '竖图', desc: '封面 / 海报', size: '1024x1536' },
  { key: '4:3', label: '横图', desc: '配图 / 展示', size: '1536x1024' },
];

function getImageAspectOption(ratio: string | undefined | null) {
  return IMAGE_ASPECT_OPTIONS.find((item) => item.key === ratio) || IMAGE_ASPECT_OPTIONS[0];
}

function getImageModelOption(modelKey: string) {
  return IMAGE_MODELS.find((item) => item.key === modelKey) || IMAGE_MODELS[0];
}

const FALLBACK_INFOGRAPHIC_TEMPLATES: InfographicTemplate[] = [
  { id: 'product', title: '产品测评卡', tag: '示例模板', preview: tplImage1 },
  { id: 'step', title: '步骤指南卡', tag: '示例模板', preview: tplImage2 },
  { id: 'compare', title: '对比清单卡', tag: '示例模板', preview: tplImage3 },
  { id: 'quote', title: '金句观点卡', tag: '示例模板', preview: tplImage4 },
  { id: 'qa', title: '问答解析卡', tag: '示例模板', preview: tplImage5 },
  { id: 'story', title: '故事拆解卡', tag: '示例模板', preview: tplImage6 },
];

type CardStyleId =
  | 'apple-notes'
  | 'instagram'
  | 'coil-notebook'
  | 'pop-art'
  | 'bytedance'
  | 'alibaba'
  | 'art-deco'
  | 'glassmorphism'
  | 'warm'
  | 'minimal'
  | 'minimalist'
  | 'dreamy'
  | 'nature'
  | 'xiaohongshu'
  | 'notebook'
  | 'business'
  | 'japanese-magazine'
  | 'darktech'
  | 'typewriter'
  | 'watercolor'
  | 'traditional-chinese'
  | 'fairytale'
  | 'cyberpunk'
  | 'meadow-dawn';
type CardStyleModeId = string;
type CardDensity = 'compact' | 'balanced' | 'relaxed';
type CardFontScale = 'xxs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl' | 'xxxl' | 'xxxxl' | 'xxxxxl' | 'xxxxxxl' | 'xxxxxxxl';
type CardThemeColor = 'amber' | 'blue' | 'green' | 'rose';
type CardRadius = 'sm' | 'md' | 'lg';
type CardHeadingSpacing = 'tight' | 'normal' | 'wide';
type CardPadding = 'xs' | 'sm' | 'md' | 'lg';
type CardFontFamily = 'system' | 'source-han' | 'puhui' | 'songti' | 'kaiti' | 'heiti' | 'mono';
type CardCoverMode = 'auto' | 'custom';
type CardEditorMode = 'edit' | 'preview';
type CardWechatStyleId = 'classic' | 'quote' | 'editorial' | 'calm';
type CardCoverStyleId =
  | 'image-focus'
  | 'grid-paper'
  | 'rounded-gray-note'
  | 'pastel-purple-cat'
  | 'warm-gray-dog'
  | 'lined-notebook'
  | 'lime-question'
  | 'mint-splash';

type CardCoverHighlightStyle = 'line' | 'circle' | 'fill';

type CardCoverStyleSpec = {
  id: CardCoverStyleId;
  title: string;
  desc: string;
  preview: string;
  defaultTextColor: string;
  defaultHighlightColor: string;
  defaultCardRadius: number;
  defaultShowStickers: boolean;
  highlightStyle: CardCoverHighlightStyle;
};

type CardStylePreset = {
  id: CardStyleId;
  title: string;
  desc: string;
  colors: string[];
  defaultMarkdown: string;
  previewBackground: string;
  textColor: string;
  accentColor: string;
  previewCardClassName?: string;
  renderTone: 'clean' | 'dark' | 'gradient';
  backendTemplateId: LegacyCardTemplateId;
  modes?: CardStyleMode[];
};

type LegacyCardTemplateId =
  | 'cinematic-film'
  | 'starry-night'
  | 'polaroid'
  | 'notion-style'
  | 'elegant-book'
  | 'ios-memo'
  | 'swiss-studio'
  | 'minimalist-magazine'
  | 'aura-gradient'
  | 'deep-night'
  | 'pro-doc'
  | 'blank';

type CardStyleMode = {
  id: CardStyleModeId;
  title: string;
  desc: string;
  colors: string[];
  previewBackground: string;
  textColor: string;
  accentColor?: string;
};

const DEFAULT_CARD_MARKDOWN = `# 复盘：内容增长不是玄学

## 为什么你会卡住
- ++下划线重点++：只追热点，不建方法论
- ==高亮重点==：没有稳定的复盘闭环
- ''标记重点''：先打样，再放大

## 先做这3步
1. 建立选题库（持续补充）
2. 固定结构模板（可复用）
3. 每周只优化一个关键指标

> 先跑通，再放大。`;

const COIL_NOTEBOOK_GRID_BLUE =
  'linear-gradient(90deg,rgba(255,255,255,0.18) 1px,transparent 1px), linear-gradient(0deg,rgba(255,255,255,0.18) 1px,transparent 1px), linear-gradient(180deg,#5271ff 0%,#5d76ff 100%)';
const COIL_NOTEBOOK_GRID_PINK =
  'linear-gradient(90deg,rgba(255,255,255,0.2) 1px,transparent 1px), linear-gradient(0deg,rgba(255,255,255,0.2) 1px,transparent 1px), linear-gradient(180deg,#ff7eb6 0%,#ffa4cd 100%)';
const COIL_NOTEBOOK_GRID_MINT =
  'linear-gradient(90deg,rgba(255,255,255,0.24) 1px,transparent 1px), linear-gradient(0deg,rgba(255,255,255,0.24) 1px,transparent 1px), linear-gradient(180deg,#7be495 0%,#a6efba 100%)';
const COIL_NOTEBOOK_GRID_YELLOW =
  'linear-gradient(90deg,rgba(255,255,255,0.28) 1px,transparent 1px), linear-gradient(0deg,rgba(255,255,255,0.28) 1px,transparent 1px), linear-gradient(180deg,#ffd66b 0%,#ffe59d 100%)';
const BYTEDANCE_GRID_BACKGROUND =
  'linear-gradient(90deg,rgba(0,102,255,0.08) 1px,transparent 1px), linear-gradient(0deg,rgba(250,44,25,0.06) 1px,transparent 1px), linear-gradient(155deg,#ffffff 0%,#f3f7ff 100%)';

const CARD_LAYOUT_STYLES: CardStylePreset[] = [
  {
    id: 'apple-notes',
    title: '苹果备忘录',
    desc: 'Apple Notes',
    colors: ['#fff9dd', '#fef3c7', '#c99500'],
    defaultMarkdown: DEFAULT_CARD_MARKDOWN,
    previewBackground: 'linear-gradient(180deg,#fff9dd 0%,#fef3c7 100%)',
    textColor: '#3f3a2a',
    accentColor: '#c99500',
    renderTone: 'gradient',
    backendTemplateId: 'ios-memo',
    modes: [
      {
        id: 'light-mode',
        title: '浅色',
        desc: 'Light',
        colors: ['#ffffff', '#f5f5f5'],
        previewBackground: 'linear-gradient(180deg,#ffffff 0%,#f5f5f5 100%)',
        textColor: '#1f2937',
      },
      {
        id: 'dark-mode',
        title: '深色',
        desc: 'Dark',
        colors: ['#000000', '#1a1a1a'],
        previewBackground: 'linear-gradient(180deg,#000000 0%,#1a1a1a 100%)',
        textColor: '#f4f5f7',
      },
    ],
  },
  {
    id: 'instagram',
    title: 'Instagram风格',
    desc: 'Instagram Style',
    colors: ['#833ab4', '#fd1d1d', '#fcb045'],
    defaultMarkdown: DEFAULT_CARD_MARKDOWN,
    previewBackground: 'linear-gradient(135deg,#833ab4 0%,#fd1d1d 50%,#fcb045 100%)',
    textColor: '#ffffff',
    accentColor: '#ffe08c',
    renderTone: 'gradient',
    backendTemplateId: 'aura-gradient',
    modes: [
      {
        id: 'classic-mode',
        title: '经典渐变',
        desc: 'Classic',
        colors: ['#833ab4', '#fd1d1d', '#fcb045'],
        previewBackground: 'linear-gradient(135deg,#833ab4 0%,#fd1d1d 50%,#fcb045 100%)',
        textColor: '#ffffff',
      },
      {
        id: 'purple-pink-mode',
        title: '粉紫梦幻',
        desc: 'Purple Pink',
        colors: ['#667eea', '#764ba2', '#f093fb'],
        previewBackground: 'linear-gradient(135deg,#667eea 0%,#764ba2 50%,#f093fb 100%)',
        textColor: '#ffffff',
      },
      {
        id: 'sunset-mode',
        title: '日落橙',
        desc: 'Sunset',
        colors: ['#ff6b35', '#f7931e', '#ffb347'],
        previewBackground: 'linear-gradient(135deg,#ff6b35 0%,#f7931e 50%,#ffb347 100%)',
        textColor: '#ffffff',
      },
      {
        id: 'night-mode',
        title: '深蓝夜空',
        desc: 'Night',
        colors: ['#2c3e50', '#34495e', '#4a69bd'],
        previewBackground: 'linear-gradient(135deg,#2c3e50 0%,#34495e 50%,#4a69bd 100%)',
        textColor: '#f3f6ff',
      },
      {
        id: 'aurora-mode',
        title: '极光模式',
        desc: 'Aurora',
        colors: ['#00c9ff', '#92fe9d', '#00d2ff'],
        previewBackground: 'linear-gradient(135deg,#00c9ff 0%,#92fe9d 50%,#00d2ff 100%)',
        textColor: '#07394a',
      },
      {
        id: 'coral-mode',
        title: '珊瑚模式',
        desc: 'Coral',
        colors: ['#ff7675', '#fd79a8', '#fdcb6e'],
        previewBackground: 'linear-gradient(135deg,#ff7675 0%,#fd79a8 50%,#fdcb6e 100%)',
        textColor: '#ffffff',
      },
      {
        id: 'mint-mode',
        title: '薄荷模式',
        desc: 'Mint',
        colors: ['#00b894', '#00cec9', '#55efc4'],
        previewBackground: 'linear-gradient(135deg,#00b894 0%,#00cec9 50%,#55efc4 100%)',
        textColor: '#003329',
      },
      {
        id: 'luxury-mode',
        title: '金色奢华',
        desc: 'Luxury Gold',
        colors: ['#d4af37', '#ffd700', '#ffed4e'],
        previewBackground: 'linear-gradient(135deg,#d4af37 0%,#ffd700 50%,#ffed4e 100%)',
        textColor: '#3a2900',
      },
      {
        id: 'dark-mode',
        title: '暗黑模式',
        desc: 'Dark',
        colors: ['#1a1a1a', '#2d2d2d', '#404040'],
        previewBackground: 'linear-gradient(135deg,#1a1a1a 0%,#2d2d2d 50%,#404040 100%)',
        textColor: '#f4f4f4',
      },
      {
        id: 'black-mode',
        title: '纯黑模式',
        desc: 'Black',
        colors: ['#000000', '#1a1a1a', '#2d2d2d'],
        previewBackground: 'linear-gradient(135deg,#000000 0%,#1a1a1a 50%,#2d2d2d 100%)',
        textColor: '#f6f6f6',
      },
      {
        id: 'white-mode',
        title: '纯白模式',
        desc: 'White',
        colors: ['#ffffff', '#f8f9fa', '#e9ecef'],
        previewBackground: 'linear-gradient(135deg,#ffffff 0%,#f8f9fa 50%,#e9ecef 100%)',
        textColor: '#1f2937',
      },
    ],
  },
  {
    id: 'coil-notebook',
    title: '线圈笔记本',
    desc: 'Coil Notebook',
    colors: ['#5271ff', '#ffffff', '#d7def9'],
    defaultMarkdown: DEFAULT_CARD_MARKDOWN,
    previewBackground: COIL_NOTEBOOK_GRID_BLUE,
    textColor: '#ffffff',
    accentColor: '#d6e3ff',
    previewCardClassName: 'style-preset-thumb--coil-notebook',
    renderTone: 'clean',
    backendTemplateId: 'notion-style',
    modes: [
      {
        id: 'blue-mode',
        title: '默认蓝',
        desc: 'Blue',
        colors: ['#5271ff', '#7790ff'],
        previewBackground: COIL_NOTEBOOK_GRID_BLUE,
        textColor: '#ffffff',
      },
      {
        id: 'pink-mode',
        title: '小红书粉',
        desc: 'Pink',
        colors: ['#ff7eb6', '#ffa4cd'],
        previewBackground: COIL_NOTEBOOK_GRID_PINK,
        textColor: '#ffffff',
      },
      {
        id: 'mint-mode',
        title: '薄荷绿',
        desc: 'Mint',
        colors: ['#7be495', '#a6efba'],
        previewBackground: COIL_NOTEBOOK_GRID_MINT,
        textColor: '#11431f',
      },
      {
        id: 'yellow-mode',
        title: '暖黄',
        desc: 'Yellow',
        colors: ['#ffd66b', '#ffe59d'],
        previewBackground: COIL_NOTEBOOK_GRID_YELLOW,
        textColor: '#4d3a00',
      },
    ],
  },
  {
    id: 'pop-art',
    title: '波普艺术',
    desc: 'Pop Art',
    colors: ['#fde041', '#2f5dff', '#101015'],
    defaultMarkdown: DEFAULT_CARD_MARKDOWN,
    previewBackground: 'linear-gradient(150deg,#fde041 0%,#ffd43b 100%)',
    textColor: '#111827',
    accentColor: '#2f5dff',
    renderTone: 'gradient',
    backendTemplateId: 'aura-gradient',
    modes: [
      {
        id: 'default-mode',
        title: '默认',
        desc: 'Default',
        colors: ['#fde041', '#ffd43b'],
        previewBackground: 'linear-gradient(150deg,#fde041 0%,#ffd43b 100%)',
        textColor: '#111827',
      },
      {
        id: 'pink-blue-mode',
        title: '粉蓝',
        desc: 'Pink & Blue',
        colors: ['#a6dcef', '#ff8ac5'],
        previewBackground: 'linear-gradient(150deg,#a6dcef 0%,#ff8ac5 100%)',
        textColor: '#10143b',
      },
      {
        id: 'mint-mode',
        title: '薄荷糖',
        desc: 'Mint',
        colors: ['#7fd1ae', '#b5e8d4'],
        previewBackground: 'linear-gradient(150deg,#7fd1ae 0%,#b5e8d4 100%)',
        textColor: '#163528',
      },
      {
        id: 'purple-mode',
        title: '紫色星空',
        desc: 'Purple',
        colors: ['#1a1042', '#33206f'],
        previewBackground: 'linear-gradient(150deg,#1a1042 0%,#33206f 100%)',
        textColor: '#f5f3ff',
      },
    ],
  },
  {
    id: 'bytedance',
    title: '字节范',
    desc: 'ByteDance',
    colors: ['#ffffff', '#0066ff', '#fa2c19'],
    defaultMarkdown: DEFAULT_CARD_MARKDOWN,
    previewBackground: BYTEDANCE_GRID_BACKGROUND,
    textColor: '#1f2937',
    accentColor: '#0066ff',
    previewCardClassName: 'style-preset-thumb--bytedance',
    renderTone: 'clean',
    backendTemplateId: 'pro-doc',
  },
  {
    id: 'alibaba',
    title: '阿里橙',
    desc: 'Alibaba',
    colors: ['#ffffff', '#ff6a00', '#ff8c00'],
    defaultMarkdown: DEFAULT_CARD_MARKDOWN,
    previewBackground: 'linear-gradient(145deg,#ffffff 0%,#fff1e8 100%)',
    textColor: '#2c2118',
    accentColor: '#ff6a00',
    renderTone: 'clean',
    backendTemplateId: 'pro-doc',
  },
  {
    id: 'art-deco',
    title: '艺术装饰',
    desc: 'Art Deco',
    colors: ['#0a0a0a', '#d4af37', '#f5e7bc'],
    defaultMarkdown: DEFAULT_CARD_MARKDOWN,
    previewBackground: 'linear-gradient(145deg,#0a0a0a 0%,#1a1a1a 60%,#2a2518 100%)',
    textColor: '#f5e7bc',
    accentColor: '#d4af37',
    renderTone: 'dark',
    backendTemplateId: 'deep-night',
  },
  {
    id: 'glassmorphism',
    title: '玻璃拟态',
    desc: 'Glass Morphism',
    colors: ['#161616', '#4f7cff', '#ffffff'],
    defaultMarkdown: DEFAULT_CARD_MARKDOWN,
    previewBackground: 'linear-gradient(145deg,#161616 0%,#242a38 60%,#2f466f 100%)',
    textColor: '#eaf0ff',
    accentColor: '#8cc6ff',
    renderTone: 'dark',
    backendTemplateId: 'deep-night',
  },
  {
    id: 'warm',
    title: '温暖柔和',
    desc: 'Warm & Soft',
    colors: ['#fff8f5', '#ffeae0', '#f08b58'],
    defaultMarkdown: DEFAULT_CARD_MARKDOWN,
    previewBackground: 'linear-gradient(135deg,#fff8f5 0%,#ffeae0 100%)',
    textColor: '#4b2e24',
    accentColor: '#f08b58',
    renderTone: 'clean',
    backendTemplateId: 'elegant-book',
  },
  {
    id: 'minimal',
    title: '简约高级灰',
    desc: 'Minimal Gray',
    colors: ['#ffffff', '#f3f4f6', '#6b7280'],
    defaultMarkdown: DEFAULT_CARD_MARKDOWN,
    previewBackground: 'linear-gradient(180deg,#ffffff 0%,#f3f4f6 100%)',
    textColor: '#374151',
    accentColor: '#6b7280',
    renderTone: 'clean',
    backendTemplateId: 'swiss-studio',
  },
  {
    id: 'minimalist',
    title: '极简黑白',
    desc: 'Minimalist B&W',
    colors: ['#ffffff', '#f5f5f5', '#111111'],
    defaultMarkdown: DEFAULT_CARD_MARKDOWN,
    previewBackground: 'linear-gradient(180deg,#ffffff 0%,#f5f5f5 100%)',
    textColor: '#111111',
    accentColor: '#111111',
    renderTone: 'clean',
    backendTemplateId: 'minimalist-magazine',
  },
  {
    id: 'dreamy',
    title: '梦幻渐变',
    desc: 'Dreamy Gradient',
    colors: ['#f5f7ff', '#e8f0ff', '#a855f7'],
    defaultMarkdown: DEFAULT_CARD_MARKDOWN,
    previewBackground: 'linear-gradient(135deg,#f5f7ff 0%,#e8f0ff 100%)',
    textColor: '#3b2c53',
    accentColor: '#a855f7',
    renderTone: 'gradient',
    backendTemplateId: 'aura-gradient',
  },
  {
    id: 'nature',
    title: '清新自然',
    desc: 'Fresh Nature',
    colors: ['#f9fcf7', '#e6f5df', '#3f7f4c'],
    defaultMarkdown: DEFAULT_CARD_MARKDOWN,
    previewBackground: 'linear-gradient(135deg,#f9fcf7 0%,#e6f5df 100%)',
    textColor: '#1f3d29',
    accentColor: '#3f7f4c',
    renderTone: 'clean',
    backendTemplateId: 'notion-style',
  },
  {
    id: 'xiaohongshu',
    title: '紫色小红书',
    desc: 'Purple Social',
    colors: ['#8863cf', '#b692ff', '#ffffff'],
    defaultMarkdown: DEFAULT_CARD_MARKDOWN,
    previewBackground: 'linear-gradient(135deg,#8863cf 0%,#b692ff 100%)',
    textColor: '#ffffff',
    accentColor: '#ffe7ff',
    renderTone: 'gradient',
    backendTemplateId: 'aura-gradient',
  },
  {
    id: 'notebook',
    title: '笔记本',
    desc: 'Notebook',
    colors: ['#f5f5f5', '#e5e7eb', '#6b7280'],
    defaultMarkdown: DEFAULT_CARD_MARKDOWN,
    previewBackground: 'linear-gradient(180deg,#f5f5f5 0%,#eceff3 100%)',
    textColor: '#374151',
    accentColor: '#6b7280',
    renderTone: 'clean',
    backendTemplateId: 'notion-style',
  },
  {
    id: 'business',
    title: '商务简报',
    desc: 'Business Brief',
    colors: ['#ffffff', '#f3f6fb', '#2563eb'],
    defaultMarkdown: DEFAULT_CARD_MARKDOWN,
    previewBackground: 'linear-gradient(180deg,#ffffff 0%,#f3f6fb 100%)',
    textColor: '#1f2937',
    accentColor: '#2563eb',
    renderTone: 'clean',
    backendTemplateId: 'pro-doc',
  },
  {
    id: 'japanese-magazine',
    title: '日本杂志',
    desc: 'Japanese Magazine',
    colors: ['#ffffff', '#f4f0ea', '#2e2a25'],
    defaultMarkdown: DEFAULT_CARD_MARKDOWN,
    previewBackground: 'linear-gradient(180deg,#ffffff 0%,#f4f0ea 100%)',
    textColor: '#2e2a25',
    accentColor: '#8b5e3c',
    renderTone: 'clean',
    backendTemplateId: 'minimalist-magazine',
  },
  {
    id: 'darktech',
    title: '暗黑科技',
    desc: 'Dark Tech',
    colors: ['#0f1218', '#1b2436', '#00d4ff'],
    defaultMarkdown: DEFAULT_CARD_MARKDOWN,
    previewBackground: 'linear-gradient(145deg,#0f1218 0%,#1b2436 100%)',
    textColor: '#d9f2ff',
    accentColor: '#00d4ff',
    renderTone: 'dark',
    backendTemplateId: 'deep-night',
  },
  {
    id: 'typewriter',
    title: '复古打字机',
    desc: 'Vintage Typewriter',
    colors: ['#f8f3e3', '#efe2c3', '#6a5d45'],
    defaultMarkdown: DEFAULT_CARD_MARKDOWN,
    previewBackground: 'linear-gradient(145deg,#f8f3e3 0%,#efe2c3 100%)',
    textColor: '#473d2d',
    accentColor: '#6a5d45',
    renderTone: 'clean',
    backendTemplateId: 'elegant-book',
  },
  {
    id: 'watercolor',
    title: '水彩艺术',
    desc: 'Watercolor Art',
    colors: ['#ffffff', '#dbeafe', '#fbcfe8'],
    defaultMarkdown: DEFAULT_CARD_MARKDOWN,
    previewBackground: 'linear-gradient(145deg,#ffffff 0%,#dbeafe 48%,#fbcfe8 100%)',
    textColor: '#3a3f51',
    accentColor: '#6f4ee6',
    renderTone: 'gradient',
    backendTemplateId: 'aura-gradient',
  },
  {
    id: 'traditional-chinese',
    title: '中国传统',
    desc: 'Traditional Chinese',
    colors: ['#f8f0e0', '#eadbc0', '#8c3a3a'],
    defaultMarkdown: DEFAULT_CARD_MARKDOWN,
    previewBackground: 'linear-gradient(145deg,#f8f0e0 0%,#eadbc0 100%)',
    textColor: '#3b2a1f',
    accentColor: '#8c3a3a',
    renderTone: 'clean',
    backendTemplateId: 'elegant-book',
  },
  {
    id: 'fairytale',
    title: '儿童童话',
    desc: "Children's Fairy Tale",
    colors: ['#fff9f9', '#ffe4ef', '#f472b6'],
    defaultMarkdown: DEFAULT_CARD_MARKDOWN,
    previewBackground: 'linear-gradient(145deg,#fff9f9 0%,#ffe4ef 100%)',
    textColor: '#5b2c44',
    accentColor: '#f472b6',
    renderTone: 'gradient',
    backendTemplateId: 'aura-gradient',
  },
  {
    id: 'cyberpunk',
    title: '赛博朋克',
    desc: 'Cyberpunk',
    colors: ['#0d0e19', '#301b5e', '#00f5ff'],
    defaultMarkdown: DEFAULT_CARD_MARKDOWN,
    previewBackground: 'linear-gradient(145deg,#0d0e19 0%,#301b5e 60%,#571089 100%)',
    textColor: '#e7f9ff',
    accentColor: '#00f5ff',
    renderTone: 'dark',
    backendTemplateId: 'deep-night',
  },
  {
    id: 'meadow-dawn',
    title: '青野晨光',
    desc: 'Meadow Dawn',
    colors: ['#8b9a7a', '#c4d6ac', '#ffffff'],
    defaultMarkdown: DEFAULT_CARD_MARKDOWN,
    previewBackground: 'linear-gradient(145deg,#8b9a7a 0%,#c4d6ac 100%)',
    textColor: '#1f2f24',
    accentColor: '#5f7a4a',
    renderTone: 'clean',
    backendTemplateId: 'notion-style',
  },
];

const CARD_DENSITY_OPTIONS: Array<{ id: CardDensity; title: string }> = [
  { id: 'compact', title: '紧凑' },
  { id: 'balanced', title: '均衡' },
  { id: 'relaxed', title: '舒展' },
];

const CARD_FONT_SCALE_OPTIONS: Array<{ id: CardFontScale; title: string }> = [
  { id: 'xxs', title: '10' },
  { id: 'xs', title: '12' },
  { id: 'sm', title: '14' },
  { id: 'md', title: '16' },
  { id: 'lg', title: '18' },
  { id: 'xl', title: '20' },
  { id: 'xxl', title: '24' },
  { id: 'xxxl', title: '28' },
  { id: 'xxxxl', title: '32' },
  { id: 'xxxxxl', title: '36' },
  { id: 'xxxxxxl', title: '44' },
  { id: 'xxxxxxxl', title: '52' },
];

const CARD_THEME_COLOR_OPTIONS: Array<{ id: CardThemeColor; title: string }> = [
  { id: 'amber', title: '琥珀黄' },
  { id: 'blue', title: '海盐蓝' },
  { id: 'green', title: '松柏绿' },
  { id: 'rose', title: '玫瑰粉' },
];

const CARD_RADIUS_OPTIONS: Array<{ id: CardRadius; title: string }> = [
  { id: 'sm', title: '小圆角' },
  { id: 'md', title: '中圆角' },
  { id: 'lg', title: '大圆角' },
];

const CARD_HEADING_SPACING_OPTIONS: Array<{ id: CardHeadingSpacing; title: string }> = [
  { id: 'tight', title: '紧凑' },
  { id: 'normal', title: '标准' },
  { id: 'wide', title: '宽松' },
];

const CARD_FONT_FAMILY_OPTIONS: Array<{ id: CardFontFamily; title: string }> = [
  { id: 'system', title: '系统无衬线' },
  { id: 'source-han', title: '思源黑体' },
  { id: 'puhui', title: '普惠体' },
  { id: 'songti', title: '宋体' },
  { id: 'kaiti', title: '楷体' },
  { id: 'heiti', title: '黑体' },
  { id: 'mono', title: '等宽字体' },
];

const CARD_COVER_MODE_OPTIONS: Array<{ id: CardCoverMode; title: string }> = [
  { id: 'auto', title: '自动提取' },
  { id: 'custom', title: '自定义' },
];

const CARD_COVER_STYLE_OPTIONS: CardCoverStyleSpec[] = [
  {
    id: 'image-focus',
    title: '图像主视觉',
    desc: '偏沉浸感封面',
    preview: 'linear-gradient(135deg,#3d2f26,#8b6a57 45%,#ccb18f)',
    defaultTextColor: '#f6efe3',
    defaultHighlightColor: '#ffb347',
    defaultCardRadius: 0,
    defaultShowStickers: false,
    highlightStyle: 'fill',
  },
  {
    id: 'grid-paper',
    title: '方格手账',
    desc: '纸感清爽',
    preview: 'linear-gradient(135deg,#f5f5f3,#edf2f1)',
    defaultTextColor: '#111111',
    defaultHighlightColor: '#f89b2f',
    defaultCardRadius: 0,
    defaultShowStickers: false,
    highlightStyle: 'line',
  },
  {
    id: 'rounded-gray-note',
    title: '圆角灰卡',
    desc: '柔和圆角',
    preview: 'linear-gradient(135deg,#f3f3f3,#dedede)',
    defaultTextColor: '#121212',
    defaultHighlightColor: '#ff7d87',
    defaultCardRadius: 46,
    defaultShowStickers: true,
    highlightStyle: 'fill',
  },
  {
    id: 'pastel-purple-cat',
    title: '紫调猫咪',
    desc: '轻松活泼',
    preview: 'linear-gradient(135deg,#d8d2ee,#c7bfe6)',
    defaultTextColor: '#27272f',
    defaultHighlightColor: '#9de8d5',
    defaultCardRadius: 0,
    defaultShowStickers: true,
    highlightStyle: 'line',
  },
  {
    id: 'warm-gray-dog',
    title: '暖灰小狗',
    desc: '暖色调',
    preview: 'linear-gradient(135deg,#e6e4df,#d9d7d1)',
    defaultTextColor: '#2b2c33',
    defaultHighlightColor: '#e7b6ff',
    defaultCardRadius: 0,
    defaultShowStickers: true,
    highlightStyle: 'circle',
  },
  {
    id: 'lined-notebook',
    title: '横线本',
    desc: '笔记感',
    preview: 'linear-gradient(135deg,#f8f8f8,#eceef2)',
    defaultTextColor: '#111111',
    defaultHighlightColor: '#9bea94',
    defaultCardRadius: 0,
    defaultShowStickers: false,
    highlightStyle: 'circle',
  },
  {
    id: 'lime-question',
    title: '亮黄提问',
    desc: '高对比吸睛',
    preview: 'linear-gradient(135deg,#e9ef97,#d9e66e)',
    defaultTextColor: '#2a2a2a',
    defaultHighlightColor: '#77eb7f',
    defaultCardRadius: 42,
    defaultShowStickers: true,
    highlightStyle: 'fill',
  },
  {
    id: 'mint-splash',
    title: '薄荷气泡',
    desc: '柔亮清新',
    preview: 'linear-gradient(135deg,#bde8ea,#92d8db)',
    defaultTextColor: '#172a2a',
    defaultHighlightColor: '#74f0a3',
    defaultCardRadius: 36,
    defaultShowStickers: false,
    highlightStyle: 'line',
  },
];

const CARD_COVER_STYLE_INDEX = new Map<CardCoverStyleId, CardCoverStyleSpec>(
  CARD_COVER_STYLE_OPTIONS.map((item) => [item.id, item]),
);

const COVER_CARD_RADIUS_MIN = 0;
const COVER_CARD_RADIUS_MAX = 64;
const COVER_TITLE_FONT_SIZE_MIN = 28;
const COVER_TITLE_FONT_SIZE_MAX = 220;
const COVER_SUBTITLE_FONT_SIZE_MIN = 22;
const COVER_SUBTITLE_FONT_SIZE_MAX = 180;
const COVER_LINE_HEIGHT_MIN = 1.1;
const COVER_LINE_HEIGHT_MAX = 2;

function getCardCoverStyleSpec(styleId: CardCoverStyleId): CardCoverStyleSpec {
  return CARD_COVER_STYLE_INDEX.get(styleId) || CARD_COVER_STYLE_OPTIONS[0];
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

const CARD_COVER_TITLE_ALIGN_X_OPTIONS: Array<{ id: 'left' | 'center' | 'right'; title: string }> = [
  { id: 'left', title: '左对齐' },
  { id: 'center', title: '居中' },
  { id: 'right', title: '右对齐' },
];

const CARD_COVER_TITLE_ALIGN_Y_OPTIONS: Array<{ id: 'top' | 'center' | 'bottom'; title: string }> = [
  { id: 'top', title: '上方' },
  { id: 'center', title: '居中' },
  { id: 'bottom', title: '下方' },
];

const TEXT_COLOR_PRESETS = [
  '#f6efe3', '#111111', '#121212', '#172a2a', '#2a2a2a', '#333333', '#000000', '#ffffff',
  '#495057', '#1c7ed6', '#d6336c', '#37b24d', '#f08c00',
];

const ACCENT_COLOR_PRESETS = [
  '#ffb347', '#f89b2f', '#ff7d87', '#9de8d5', '#e7b6ff', '#9bea94', '#77eb7f', '#74f0a3',
  '#FF9500', '#FF2D55', '#007AFF', '#34C759', '#5856D6', '#00F5FF', '#FF4500', '#000000', '#fbbf24', '#f472b6',
];

const CARD_MAX_PAGE_OPTIONS = [4, 6, 8, 10];
const INFOGRAPHIC_COUNT_OPTIONS = [1, 2, 3, 4, 5];
const IMAGE_GENERATE_PREFS_KEY = 'IMAGE_GENERATE_PREFS_V1';

type CardWechatStyleSpec = {
  id: CardWechatStyleId;
  title: string;
  desc: string;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  accentSoftColor: string;
  borderColor: string;
};

const CARD_WECHAT_STYLE_OPTIONS: CardWechatStyleSpec[] = [
  {
    id: 'classic',
    title: '公众号经典',
    desc: '白底蓝灰，适合通用长文',
    backgroundColor: '#ffffff',
    textColor: '#333333',
    accentColor: '#576b95',
    accentSoftColor: 'rgba(87,107,149,0.1)',
    borderColor: '#e8e8e8',
  },
  {
    id: 'quote',
    title: '观点专栏',
    desc: '强调引用与金句',
    backgroundColor: '#fffdf8',
    textColor: '#2d2a24',
    accentColor: '#9a6a2f',
    accentSoftColor: 'rgba(154,106,47,0.1)',
    borderColor: '#eadfcf',
  },
  {
    id: 'editorial',
    title: '杂志正文',
    desc: '黑白克制，适合深度稿',
    backgroundColor: '#ffffff',
    textColor: '#1f2328',
    accentColor: '#111111',
    accentSoftColor: 'rgba(17,17,17,0.08)',
    borderColor: '#dddddd',
  },
  {
    id: 'calm',
    title: '清爽知识',
    desc: '低饱和绿色，适合教程',
    backgroundColor: '#fbfefb',
    textColor: '#22362b',
    accentColor: '#2f7a52',
    accentSoftColor: 'rgba(47,122,82,0.1)',
    borderColor: '#d8eadf',
  },
];

const CARD_WECHAT_STYLE_INDEX = new Map<CardWechatStyleId, CardWechatStyleSpec>(
  CARD_WECHAT_STYLE_OPTIONS.map((item) => [item.id, item]),
);

function getCardWechatStyleSpec(styleId: CardWechatStyleId): CardWechatStyleSpec {
  return CARD_WECHAT_STYLE_INDEX.get(styleId) || CARD_WECHAT_STYLE_OPTIONS[0];
}

type ImageGeneratePrefs = {
  activeFeature?: FeatureKey;
  selectedModel?: string;
  selectedImageAspect?: ImageAspectRatio;
  selectedTemplate?: string;
  infographicCount?: number;
  selectedCardStyle?: CardStyleId;
  selectedCardStyleMode?: CardStyleModeId;
  cardIncludeCover?: boolean;
  cardMaxPages?: number;
  cardDensity?: CardDensity;
  cardH1FontScale?: CardFontScale;
  cardH2FontScale?: CardFontScale;
  cardH3FontScale?: CardFontScale;
  cardHeadingFontScale?: CardFontScale;
  cardBodyFontScale?: CardFontScale;
  cardFontScale?: CardFontScale;
  cardThemeColor?: CardThemeColor;
  cardRadius?: CardRadius;
  cardHeadingSpacing?: CardHeadingSpacing;
  cardPadding?: CardPadding;
  cardFontFamily?: CardFontFamily;
  cardCoverMode?: CardCoverMode;
  cardCoverStyleId?: CardCoverStyleId;
  cardCoverImage?: string;
  cardCoverTitle?: string;
  cardCoverSubtitle?: string;
  cardCoverTextColor?: string;
  cardCoverHighlightColor?: string;
  cardCoverCardRadius?: number;
  cardCoverShowStickers?: boolean;
  cardCoverFontFamily?: CardFontFamily;
  cardCoverTitleAlignX?: 'left' | 'center' | 'right';
  cardCoverTitleAlignY?: 'top' | 'center' | 'bottom';
  cardCoverFontSize?: number;
  cardCoverSubtitleFontSize?: number;
  cardCoverLineHeight?: number;
  cardEditorMode?: CardEditorMode;
  cardWechatMode?: boolean;
  cardWechatStyleId?: CardWechatStyleId;
};

const CARD_STYLE_INDEX = new Map<CardStyleId, CardStylePreset>(CARD_LAYOUT_STYLES.map((item) => [item.id, item]));

const LEGACY_CARD_STYLE_ALIAS_MAP: Partial<Record<LegacyCardTemplateId, CardStyleId>> = {
  'cinematic-film': 'darktech',
  'starry-night': 'instagram',
  polaroid: 'minimal',
  'notion-style': 'notebook',
  'elegant-book': 'traditional-chinese',
  'ios-memo': 'apple-notes',
  'swiss-studio': 'business',
  'minimalist-magazine': 'minimalist',
  'aura-gradient': 'dreamy',
  'deep-night': 'cyberpunk',
  'pro-doc': 'bytedance',
  blank: 'minimalist',
};

const CARD_THEME_ACCENT_MAP: Record<CardThemeColor, string> = {
  amber: '#ecee9f',
  blue: '#8ed0ff',
  green: '#9de7bf',
  rose: '#ffb3ca',
};

const CARD_THEME_ACCENT_SOFT_MAP: Record<CardThemeColor, string> = {
  amber: 'rgba(236, 238, 159, 0.24)',
  blue: 'rgba(142, 208, 255, 0.24)',
  green: 'rgba(157, 231, 191, 0.24)',
  rose: 'rgba(255, 179, 202, 0.26)',
};

const CARD_PADDING_OPTIONS: Array<{ id: CardPadding; title: string }> = [
  { id: 'xs', title: '紧凑' },
  { id: 'sm', title: '较小' },
  { id: 'md', title: '标准' },
  { id: 'lg', title: '宽松' },
];

const CARD_FONT_FAMILY_STACK_MAP: Record<CardFontFamily, string> = {
  system: '-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,PingFang SC,Hiragino Sans GB,Microsoft YaHei,sans-serif',
  'source-han': 'Source Han Sans SC,Noto Sans CJK SC,PingFang SC,Microsoft YaHei,sans-serif',
  puhui: 'Alibaba PuHuiTi,AlibabaPuHuiTi,PingFang SC,Microsoft YaHei,sans-serif',
  songti: 'STSong,Songti SC,SimSun,Source Han Serif SC,Noto Serif CJK SC,serif',
  kaiti: 'STKaiti,Kaiti SC,KaiTi,serif',
  heiti: 'STHeiti,SimHei,PingFang SC,Microsoft YaHei,sans-serif',
  mono: 'ui-monospace,SFMono-Regular,Menlo,Consolas,Monaco,monospace',
};

const CARD_FONT_SCALE_FACTOR_MAP: Record<CardFontScale, number> = {
  xxs: 0.56,
  xs: 0.7,
  sm: 0.85,
  md: 1,
  lg: 1.18,
  xl: 1.36,
  xxl: 1.56,
  xxxl: 1.78,
  xxxxl: 2,
  xxxxxl: 2.25,
  xxxxxxl: 2.75,
  xxxxxxxl: 3.25,
};

const CARD_STYLE_PREVIEW_IMAGE_MAP: Partial<Record<CardStyleId, string>> = {};

type PreviewRenderStyle = {
  textColor: string;
  accentColor: string;
  accentSoftColor: string;
  density: CardDensity;
  h1FontScale: CardFontScale;
  h2FontScale: CardFontScale;
  h3FontScale: CardFontScale;
  bodyFontScale: CardFontScale;
  headingSpacing: CardHeadingSpacing;
  padding: CardPadding;
  fontFamily: CardFontFamily;
  spacingScale?: number;
};

type CardPreviewThemeSpec = {
  cardBackground: string;
  textColor: string;
  contentBackground?: string;
  modeTextColor?: Partial<Record<CardStyleModeId, string>>;
  modeBackground?: Partial<Record<CardStyleModeId, string>>;
  modeContentBackground?: Partial<Record<CardStyleModeId, string>>;
};

type CardStyleLayoutParams = {
  background: string;
  textColor: string;
  accent: string;
  spacing: number;
  headerHeight: number;
  footerHeight: number;
  contentBackground?: string;
  contentPaddingX?: number;
  contentPaddingY?: number;
};

const CARD_STYLE_LAYOUT_PARAMS: Record<CardStyleId, CardStyleLayoutParams> = {
  'apple-notes': {
    background: '#ffffff',
    textColor: '#333333',
    accent: '#c99500',
    spacing: 1,
    headerHeight: 46,
    footerHeight: 8,
    contentPaddingX: 0,
    contentPaddingY: 0,
  },
  instagram: {
    background: 'linear-gradient(135deg,#833ab4 0%,#fd1d1d 50%,#fcb045 100%)',
    textColor: '#1a1a1a',
    accent: '#ffe08c',
    spacing: 1.04,
    headerHeight: 0,
    footerHeight: 10,
    contentBackground: 'rgba(255,255,255,0.75)',
    contentPaddingX: 20,
    contentPaddingY: 18,
  },
  'coil-notebook': {
    background: COIL_NOTEBOOK_GRID_BLUE,
    textColor: '#24292e',
    accent: '#d6e3ff',
    spacing: 1,
    headerHeight: 0,
    footerHeight: 10,
    contentBackground: '#ffffff',
    contentPaddingX: 38,
    contentPaddingY: 30,
  },
  'pop-art': {
    background: 'radial-gradient(rgba(17,24,39,0.2) 1.1px, transparent 1.3px), linear-gradient(0deg,#fde041,#fde041)',
    textColor: '#252a34',
    accent: '#2f5dff',
    spacing: 1.02,
    headerHeight: 0,
    footerHeight: 10,
    contentPaddingX: 20,
    contentPaddingY: 18,
  },
  bytedance: {
    background: BYTEDANCE_GRID_BACKGROUND,
    textColor: '#111827',
    accent: '#0066ff',
    spacing: 0.96,
    headerHeight: 0,
    footerHeight: 10,
    contentBackground: 'rgba(255,255,255,0.96)',
    contentPaddingX: 22,
    contentPaddingY: 20,
  },
  alibaba: {
    background:
      'radial-gradient(circle at 84% 18%, rgba(255, 106, 0, 0.2) 0, transparent 24%), radial-gradient(circle at 72% 28%, rgba(255, 140, 0, 0.14) 0, transparent 18%), linear-gradient(145deg,#ffffff 0%,#fff1e8 100%)',
    textColor: '#333333',
    accent: '#ff6a00',
    spacing: 1,
    headerHeight: 0,
    footerHeight: 10,
    contentBackground: 'rgba(255,255,255,0.9)',
    contentPaddingX: 20,
    contentPaddingY: 18,
  },
  'art-deco': {
    background:
      'linear-gradient(45deg, rgba(212, 175, 55, 0.12) 0 1px, transparent 1px 16px), linear-gradient(-45deg, rgba(212, 175, 55, 0.1) 0 1px, transparent 1px 16px), linear-gradient(145deg,#0a0a0a 0%,#1a1a1a 60%,#2a2518 100%)',
    textColor: '#f7f0d1',
    accent: '#d4af37',
    spacing: 1.08,
    headerHeight: 0,
    footerHeight: 10,
    contentPaddingX: 20,
    contentPaddingY: 18,
  },
  glassmorphism: {
    background: '#161616',
    textColor: 'rgba(255,255,255,0.85)',
    accent: '#8cc6ff',
    spacing: 1,
    headerHeight: 0,
    footerHeight: 10,
    contentBackground: 'rgba(255,255,255,0.08)',
    contentPaddingX: 20,
    contentPaddingY: 18,
  },
  warm: {
    background: 'linear-gradient(135deg,#fff8f5 0%,#ffeae0 100%)',
    textColor: '#2f2a2a',
    accent: '#f08b58',
    spacing: 1.06,
    headerHeight: 0,
    footerHeight: 10,
    contentPaddingX: 20,
    contentPaddingY: 18,
  },
  minimal: {
    background: '#ffffff',
    textColor: '#222222',
    accent: '#6b7280',
    spacing: 0.96,
    headerHeight: 0,
    footerHeight: 10,
    contentPaddingX: 20,
    contentPaddingY: 18,
  },
  minimalist: {
    background: '#ffffff',
    textColor: '#000000',
    accent: '#111111',
    spacing: 0.93,
    headerHeight: 0,
    footerHeight: 10,
    contentPaddingX: 20,
    contentPaddingY: 18,
  },
  dreamy: {
    background: 'linear-gradient(135deg,#f5f7ff 0%,#e8f0ff 100%)',
    textColor: '#2f355d',
    accent: '#a855f7',
    spacing: 1.04,
    headerHeight: 0,
    footerHeight: 10,
    contentPaddingX: 20,
    contentPaddingY: 18,
  },
  nature: {
    background: '#f9fcf7',
    textColor: '#2d4730',
    accent: '#3f7f4c',
    spacing: 1.02,
    headerHeight: 0,
    footerHeight: 10,
    contentPaddingX: 20,
    contentPaddingY: 18,
  },
  xiaohongshu: {
    background: '#8863cf',
    textColor: '#ffffff',
    accent: '#ffe7ff',
    spacing: 1.01,
    headerHeight: 0,
    footerHeight: 10,
    contentPaddingX: 20,
    contentPaddingY: 18,
  },
  notebook: {
    background: 'linear-gradient(rgba(107, 114, 128, 0.1) 1px, transparent 1px), linear-gradient(0deg,#f5f5f5,#f5f5f5)',
    textColor: '#2d3748',
    accent: '#6b7280',
    spacing: 1,
    headerHeight: 0,
    footerHeight: 10,
    contentBackground: 'rgba(255,255,255,0.9)',
    contentPaddingX: 20,
    contentPaddingY: 18,
  },
  business: {
    background:
      'linear-gradient(90deg, rgba(37,99,235,0.08) 1px, transparent 1px), linear-gradient(rgba(37,99,235,0.05) 1px, transparent 1px), linear-gradient(180deg,#ffffff 0%,#f3f6fb 100%)',
    textColor: '#1f2937',
    accent: '#2563eb',
    spacing: 0.98,
    headerHeight: 0,
    footerHeight: 10,
    contentBackground: 'rgba(255,255,255,0.92)',
    contentPaddingX: 20,
    contentPaddingY: 18,
  },
  'japanese-magazine': {
    background: '#ffffff',
    textColor: '#222222',
    accent: '#8b5e3c',
    spacing: 0.95,
    headerHeight: 0,
    footerHeight: 10,
    contentPaddingX: 20,
    contentPaddingY: 18,
  },
  darktech: {
    background: '#0f1218',
    textColor: '#e6fbff',
    accent: '#00d4ff',
    spacing: 1.03,
    headerHeight: 0,
    footerHeight: 10,
    contentPaddingX: 20,
    contentPaddingY: 18,
  },
  typewriter: {
    background:
      'radial-gradient(rgba(106, 93, 69, 0.16) 1px, transparent 1.3px), linear-gradient(145deg,#f8f3e3 0%,#efe2c3 100%)',
    textColor: '#4a3b2a',
    accent: '#6a5d45',
    spacing: 1.08,
    headerHeight: 0,
    footerHeight: 10,
    contentBackground: 'rgba(255,249,236,0.9)',
    contentPaddingX: 20,
    contentPaddingY: 18,
  },
  watercolor: {
    background: 'linear-gradient(to right,rgba(173,216,230,0.6),rgba(221,160,221,0.6),rgba(255,182,193,0.6),rgba(173,216,230,0.6))',
    textColor: '#374151',
    accent: '#6f4ee6',
    spacing: 1.06,
    headerHeight: 0,
    footerHeight: 10,
    contentPaddingX: 20,
    contentPaddingY: 18,
  },
  'traditional-chinese': {
    background: '#f8f0e0',
    textColor: '#3f2a1f',
    accent: '#8c3a3a',
    spacing: 1.08,
    headerHeight: 0,
    footerHeight: 10,
    contentPaddingX: 20,
    contentPaddingY: 18,
  },
  fairytale: {
    background: '#f8f0ff',
    textColor: '#344a9a',
    accent: '#f472b6',
    spacing: 1.08,
    headerHeight: 0,
    footerHeight: 10,
    contentPaddingX: 20,
    contentPaddingY: 18,
  },
  cyberpunk: {
    background:
      'linear-gradient(90deg, rgba(0,245,255,0.12) 1px, transparent 1px), linear-gradient(rgba(217,70,239,0.1) 1px, transparent 1px), linear-gradient(145deg,#0d0e19 0%,#301b5e 60%,#571089 100%)',
    textColor: '#e0e0e0',
    accent: '#00f5ff',
    spacing: 1.02,
    headerHeight: 0,
    footerHeight: 10,
    contentBackground: 'rgba(13,14,25,0.58)',
    contentPaddingX: 20,
    contentPaddingY: 18,
  },
  'meadow-dawn': {
    background: '#f0e6d2',
    backgroundImage: `url("${md2MeadowDawnBg}")`,
    textColor: '#5a4a3f',
    accent: '#5f7a4a',
    spacing: 1.07,
    headerHeight: 0,
    footerHeight: 10,
    contentBackground: `linear-gradient(rgba(255,253,245,0.84), rgba(255,253,245,0.84)), url("${md2MeadowDawnBg}")`,
    contentPaddingX: 20,
    contentPaddingY: 18,
  },
};

const CARD_PREVIEW_THEME_SPEC_MAP: Record<CardStyleId, CardPreviewThemeSpec> = {
  'apple-notes': {
    cardBackground: '#fff',
    textColor: '#333333',
    modeTextColor: {
      'dark-mode': '#ffffff',
      'light-mode': '#333333',
    },
    modeBackground: {
      'light-mode': '#ffffff',
      'dark-mode': '#1c1c1e',
    },
  },
  instagram: {
    cardBackground: 'linear-gradient(135deg,#833ab4 0%,#fd1d1d 50%,#fcb045 100%)',
    textColor: '#1a1a1a',
    contentBackground: 'rgba(255,255,255,0.75)',
    modeBackground: {
      'classic-mode': 'linear-gradient(135deg,#833ab4 0%,#fd1d1d 50%,#fcb045 100%)',
      'purple-pink-mode': 'linear-gradient(135deg,#667eea 0%,#764ba2 50%,#f093fb 100%)',
      'sunset-mode': 'linear-gradient(135deg,#ff6b35 0%,#f7931e 50%,#ffb347 100%)',
      'night-mode': 'linear-gradient(135deg,#2c3e50 0%,#34495e 50%,#4a69bd 100%)',
      'aurora-mode': 'linear-gradient(135deg,#00c9ff 0%,#92fe9d 50%,#00d2ff 100%)',
      'coral-mode': 'linear-gradient(135deg,#ff7675 0%,#fd79a8 50%,#fdcb6e 100%)',
      'mint-mode': 'linear-gradient(135deg,#00b894 0%,#00cec9 50%,#55efc4 100%)',
      'luxury-mode': 'linear-gradient(135deg,#d4af37 0%,#ffd700 50%,#ffed4e 100%)',
      'dark-mode': 'linear-gradient(135deg,#1a1a1a 0%,#2d2d2d 50%,#404040 100%)',
      'black-mode': 'linear-gradient(135deg,#000000 0%,#1a1a1a 50%,#2d2d2d 100%)',
      'white-mode': 'linear-gradient(135deg,#ffffff 0%,#f8f9fa 50%,#e9ecef 100%)',
    },
    modeTextColor: {
      'night-mode': '#ffffff',
      'dark-mode': '#ffffff',
      'black-mode': '#ffffff',
      'luxury-mode': '#ffffff',
      'white-mode': '#1a1a1a',
      'mint-mode': '#2d3436',
    },
    modeContentBackground: {
      'night-mode': 'rgba(255,255,255,0.12)',
      'dark-mode': 'rgba(255,255,255,0.1)',
      'black-mode': 'rgba(255,255,255,0.08)',
      'luxury-mode': 'rgba(0,0,0,0.55)',
      'white-mode': 'rgba(255,255,255,0.86)',
    },
  },
  'coil-notebook': {
    cardBackground: COIL_NOTEBOOK_GRID_BLUE,
    textColor: '#24292e',
    contentBackground: '#ffffff',
    modeBackground: {
      'blue-mode': COIL_NOTEBOOK_GRID_BLUE,
      'pink-mode': COIL_NOTEBOOK_GRID_PINK,
      'mint-mode': COIL_NOTEBOOK_GRID_MINT,
      'yellow-mode': COIL_NOTEBOOK_GRID_YELLOW,
    },
  },
  'pop-art': {
    cardBackground: 'radial-gradient(rgba(17,24,39,0.2) 1.1px, transparent 1.3px), linear-gradient(0deg,#fde041,#fde041)',
    textColor: '#252a34',
    modeBackground: {
      'default-mode': 'radial-gradient(rgba(17,24,39,0.2) 1.1px, transparent 1.3px), linear-gradient(0deg,#fde041,#fde041)',
      'pink-blue-mode': 'radial-gradient(rgba(16,20,59,0.16) 1.1px, transparent 1.3px), linear-gradient(0deg,#a6dcef,#a6dcef)',
      'mint-mode': 'radial-gradient(rgba(22,53,40,0.18) 1.1px, transparent 1.3px), linear-gradient(0deg,#7fd1ae,#7fd1ae)',
      'purple-mode': 'radial-gradient(rgba(234,240,255,0.18) 1.1px, transparent 1.3px), linear-gradient(0deg,#1a1042,#1a1042)',
    },
    modeTextColor: {
      'purple-mode': '#eaf0ff',
    },
  },
  bytedance: {
    cardBackground: BYTEDANCE_GRID_BACKGROUND,
    textColor: '#111827',
    contentBackground: 'rgba(255,255,255,0.96)',
  },
  alibaba: {
    cardBackground:
      'radial-gradient(circle at 84% 18%, rgba(255, 106, 0, 0.2) 0, transparent 24%), radial-gradient(circle at 72% 28%, rgba(255, 140, 0, 0.14) 0, transparent 18%), linear-gradient(145deg,#ffffff 0%,#fff1e8 100%)',
    textColor: '#333333',
    contentBackground: 'rgba(255,255,255,0.9)',
  },
  'art-deco': {
    cardBackground:
      'linear-gradient(45deg, rgba(212, 175, 55, 0.12) 0 1px, transparent 1px 16px), linear-gradient(-45deg, rgba(212, 175, 55, 0.1) 0 1px, transparent 1px 16px), linear-gradient(145deg,#0a0a0a 0%,#1a1a1a 60%,#2a2518 100%)',
    textColor: '#f7f0d1',
  },
  glassmorphism: { cardBackground: '#161616', textColor: 'rgba(255,255,255,0.85)', contentBackground: 'rgba(255,255,255,0.08)' },
  warm: { cardBackground: 'linear-gradient(135deg,#fff8f5 0%,#ffeae0 100%)', textColor: '#2f2a2a' },
  minimal: { cardBackground: '#ffffff', textColor: '#222222' },
  minimalist: { cardBackground: '#ffffff', textColor: '#000000' },
  dreamy: { cardBackground: 'linear-gradient(135deg,#f5f7ff 0%,#e8f0ff 100%)', textColor: '#2f355d' },
  nature: { cardBackground: '#f9fcf7', textColor: '#2d4730' },
  xiaohongshu: { cardBackground: '#8863cf', textColor: '#ffffff' },
  notebook: {
    cardBackground: 'linear-gradient(rgba(107, 114, 128, 0.1) 1px, transparent 1px), linear-gradient(0deg,#f5f5f5,#f5f5f5)',
    textColor: '#2d3748',
    contentBackground: 'rgba(255,255,255,0.9)',
  },
  business: {
    cardBackground:
      'linear-gradient(90deg, rgba(37,99,235,0.08) 1px, transparent 1px), linear-gradient(rgba(37,99,235,0.05) 1px, transparent 1px), linear-gradient(180deg,#ffffff 0%,#f3f6fb 100%)',
    textColor: '#1f2937',
    contentBackground: 'rgba(255,255,255,0.92)',
  },
  'japanese-magazine': { cardBackground: '#ffffff', textColor: '#222222' },
  darktech: { cardBackground: '#0f1218', textColor: '#e6fbff' },
  typewriter: {
    cardBackground:
      'radial-gradient(rgba(106, 93, 69, 0.16) 1px, transparent 1.3px), linear-gradient(145deg,#f8f3e3 0%,#efe2c3 100%)',
    textColor: '#4a3b2a',
    contentBackground: 'rgba(255,249,236,0.9)',
  },
  watercolor: { cardBackground: 'linear-gradient(to right,rgba(173,216,230,0.6),rgba(221,160,221,0.6),rgba(255,182,193,0.6),rgba(173,216,230,0.6))', textColor: '#374151' },
  'traditional-chinese': { cardBackground: '#f8f0e0', textColor: '#3f2a1f' },
  fairytale: { cardBackground: '#f8f0ff', textColor: '#344a9a' },
  cyberpunk: {
    cardBackground:
      'linear-gradient(90deg, rgba(0,245,255,0.12) 1px, transparent 1px), linear-gradient(rgba(217,70,239,0.1) 1px, transparent 1px), linear-gradient(145deg,#0d0e19 0%,#301b5e 60%,#571089 100%)',
    textColor: '#e0e0e0',
    contentBackground: 'rgba(13,14,25,0.58)',
  },
  'meadow-dawn': {
    cardBackground: '#f0e6d2',
    textColor: '#5a4a3f',
    contentBackground: `linear-gradient(rgba(255,253,245,0.84), rgba(255,253,245,0.84)), url("${md2MeadowDawnBg}")`,
  },
};

function getCardStylePreset(styleId?: CardStyleId | null): CardStylePreset {
  if (styleId && CARD_STYLE_INDEX.has(styleId)) {
    return CARD_STYLE_INDEX.get(styleId)!;
  }
  return CARD_LAYOUT_STYLES[0];
}

function resolveCardStyleId(rawStyleId: unknown): CardStyleId {
  const value = typeof rawStyleId === 'string' ? rawStyleId : '';
  if (CARD_STYLE_INDEX.has(value as CardStyleId)) return value as CardStyleId;
  const mapped = LEGACY_CARD_STYLE_ALIAS_MAP[value as LegacyCardTemplateId];
  if (mapped && CARD_STYLE_INDEX.has(mapped)) return mapped;
  return CARD_LAYOUT_STYLES[0].id;
}

function buildPreviewBackgroundStyle(background: string): Record<string, string> {
  const value = (background || '').trim();
  if (!value) return {};
  if (value.startsWith('linear-gradient(') || value.startsWith('radial-gradient(') || value.startsWith('url(')) {
    return { backgroundImage: value };
  }
  return { backgroundColor: value };
}

function buildPreviewBackgroundVarStyle(background: string): Record<string, string> {
  const value = (background || '').trim();
  if (!value) return {};
  return {
    '--preview-bg': value,
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, '&quot;');
}

function isGeneratedCardNoiseLine(line: string): boolean {
  const normalized = line
    .replace(/^#{1,6}\s*/, '')
    .replace(/^[>-\s*]+/, '')
    .replace(/^\d+[.、)\s]+/, '')
    .replace(/[:：\s]+$/g, '')
    .trim();
  return /^(图片|图文)(文案|正文)?要点$/.test(normalized);
}

function cleanMyNoteCardText(input: string): string {
  const withoutNoiseLines = (input || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => !isGeneratedCardNoiseLine(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return withoutNoiseLines
    .replace(/\n{2,}(?=\d+\.\s+)/g, '\n')
    .replace(/(\d+\.\s+[^\n]+)\n{2,}(?=\S)/g, '$1\n')
    .trim();
}

function parseInlineMarkdown(line: string): string {
  const escaped = escapeHtml(line);
  let html = escaped;
  html = html.replace(/''(.+?)''/g, '<mark class="md-mark">$1</mark>');
  html = html.replace(/==(.+?)==/g, '<mark class="md-mark">$1</mark>');
  html = html.replace(/\+\+(.+?)\+\+/g, '<u>$1</u>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.+?)_/g, '<em>$1</em>');
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');
  html = html.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
  return html;
}

function buildColorSwatchStyle(color: string): Record<string, string> {
  const value = (color || '').trim();
  if (value.startsWith('linear-gradient(')) {
    return { backgroundImage: value };
  }
  return { backgroundColor: value };
}

function applyInlineTokenStyles(html: string, textColor: string, accentColor: string, accentSoftColor: string): string {
  const markStyle = `background:${accentSoftColor};color:${textColor};padding:0 3px;border-radius:3px;`;
  const underlineStyle = `text-decoration:underline;text-decoration-thickness:1px;text-decoration-color:${accentColor};`;
  const codeStyle = `font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;background:rgba(0,0,0,0.08);border-radius:4px;padding:1px 3px;color:${textColor};`;
  return html
    .replace(/<mark class="md-mark">/g, `<mark style="${markStyle}">`)
    .replace(/<u>/g, `<u style="${underlineStyle}">`)
    .replace(/<code class="md-inline-code">/g, `<code style="${codeStyle}">`);
}

function splitMiniMarkdownTableRow(line: string): string[] {
  const trimmed = line.trim();
  const source = trimmed.startsWith('|') && trimmed.endsWith('|') ? trimmed.slice(1, -1) : trimmed;
  const cells: string[] = [];
  let current = '';
  let escaping = false;

  for (const char of source) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === '\\') {
      escaping = true;
      continue;
    }
    if (char === '|') {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function isMiniMarkdownTableSeparator(line: string): boolean {
  const cells = splitMiniMarkdownTableRow(line);
  if (cells.length < 2) return false;
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, '')));
}

function isMiniMarkdownTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.includes('|') && splitMiniMarkdownTableRow(trimmed).length >= 2;
}

function renderMiniMarkdown(markdown: string, previewStyle: PreviewRenderStyle): string {
  const normalizedMarkdown = (markdown || '')
    .replace(/\r\n/g, '\n')
    .replace(/<\/?details[^>]*>/gi, '')
    .replace(/<\/?summary[^>]*>/gi, '');
  const { textColor, accentColor, accentSoftColor, density, h1FontScale, h2FontScale, h3FontScale, bodyFontScale, headingSpacing, fontFamily } = previewStyle;
  const h1ScaleFactor = CARD_FONT_SCALE_FACTOR_MAP[h1FontScale] || 1;
  const h2ScaleFactor = CARD_FONT_SCALE_FACTOR_MAP[h2FontScale] || 1;
  const h3ScaleFactor = CARD_FONT_SCALE_FACTOR_MAP[h3FontScale] || 1;
  const bodyScaleFactor = CARD_FONT_SCALE_FACTOR_MAP[bodyFontScale] || 1;
  const spacingScale = Math.max(0.78, Math.min(1.36, previewStyle.spacingScale || 1));
  const lineHeight = (density === 'compact' ? 1.5 : density === 'relaxed' ? 1.72 : 1.6) * Math.max(0.94, Math.min(1.12, spacingScale));
  const paragraphGap = Math.round((density === 'compact' ? 6 : density === 'relaxed' ? 12 : 8) * spacingScale);
  const listGap = Math.round((density === 'compact' ? 3 : density === 'relaxed' ? 7 : 5) * spacingScale);
  const headingBottom = headingSpacing === 'tight' ? 3 : headingSpacing === 'wide' ? 12 : 8;
  const headingTop = headingSpacing === 'tight' ? 6 : headingSpacing === 'wide' ? 12 : 9;
  const padding = previewStyle.padding === 'xs' ? 10 : previewStyle.padding === 'sm' ? 14 : previewStyle.padding === 'lg' ? 24 : 18;
  const px = (size: number, factor: number = 1, min: number = 10) => Math.max(min, Math.round(size * factor));
  const bodyStyle = `margin:0 0 ${paragraphGap}px;line-height:${lineHeight};font-size:${px(14, bodyScaleFactor, 11)}px;color:${textColor};`;
  const h1Style = `margin:0 0 ${headingBottom + 3}px;font-size:${px(20, h1ScaleFactor, 15)}px;line-height:1.34;font-weight:800;color:${textColor};`;
  const h2Style = `margin:${headingTop}px 0 ${headingBottom}px;font-size:${px(18, h2ScaleFactor, 14)}px;line-height:1.4;font-weight:700;color:${textColor};`;
  const h3Style = `margin:${Math.max(5, headingTop - 1)}px 0 ${Math.max(3, headingBottom - 1)}px;font-size:${px(16, h3ScaleFactor, 13)}px;line-height:1.42;font-weight:700;color:${textColor};`;
  const ulStyle = `margin:0 0 ${paragraphGap}px ${padding + 10}px;padding:0 0 0 8px;color:${textColor};`;
  const liStyle = `margin-bottom:${listGap}px;line-height:${lineHeight};font-size:${px(14, bodyScaleFactor, 11)}px;color:${textColor};padding-left:4px;`;
  const quoteStyle = `margin:${Math.max(4, paragraphGap - 2)}px 0 ${paragraphGap + 2}px;padding:6px 9px;border-left:3px solid ${accentColor};background:${accentSoftColor};border-radius:6px;font-size:${px(13, bodyScaleFactor, 11)}px;color:${textColor};`;
  const preStyle = 'margin:8px 0 10px;padding:8px;border-radius:8px;background:rgba(0,0,0,0.12);overflow-x:auto;';
  const codeStyle = `font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:${px(12, bodyScaleFactor, 10)}px;color:${textColor};`;
  const hrStyle = 'border:0;border-top:1px solid rgba(127,127,127,0.35);margin:10px 0;';
  const imageStyle = 'width:100%;border-radius:8px;margin:6px 0;';
  const spacerStyle = 'margin:0;height:8px;';
  const tableStyle = `width:100%;margin:${Math.max(6, paragraphGap)}px 0 ${paragraphGap + 2}px;color:${textColor};font-size:${px(12, bodyScaleFactor, 10)}px;line-height:1.42;border-left:1px solid rgba(127,127,127,0.32);border-top:1px solid rgba(127,127,127,0.32);`;
  const tableRowStyle = 'display:flex;width:100%;';
  const thStyle = `box-sizing:border-box;border-right:1px solid rgba(127,127,127,0.32);border-bottom:1px solid rgba(127,127,127,0.32);padding:5px 6px;background:${accentSoftColor};font-weight:700;color:${textColor};`;
  const tdStyle = `box-sizing:border-box;border-right:1px solid rgba(127,127,127,0.26);border-bottom:1px solid rgba(127,127,127,0.26);padding:5px 6px;color:${textColor};`;
  const lines = normalizedMarkdown.split('\n');
  const blocks: string[] = [];
  let inUl = false;
  let inOl = false;
  let inCode = false;
  let index = 0;
  const closeLists = () => {
    if (inUl) {
      blocks.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      blocks.push('</ol>');
      inOl = false;
    }
  };

  while (index < lines.length) {
    const rawLine = lines[index];
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      closeLists();
      if (!inCode) {
        inCode = true;
        blocks.push(`<pre class="md-pre" style="${preStyle}"><code style="${codeStyle}">`);
      } else {
        inCode = false;
        blocks.push('</code></pre>');
      }
      index += 1;
      continue;
    }

    if (inCode) {
      blocks.push(`${escapeHtml(line)}\n`);
      index += 1;
      continue;
    }

    if (isMiniMarkdownTableRow(trimmed) && isMiniMarkdownTableSeparator(lines[index + 1] || '')) {
      closeLists();
      const headerCells = splitMiniMarkdownTableRow(trimmed);
      const tableRows: string[][] = [];
      index += 2;
      while (index < lines.length && isMiniMarkdownTableRow(lines[index] || '')) {
        tableRows.push(splitMiniMarkdownTableRow(lines[index] || ''));
        index += 1;
      }
      const columnCount = Math.max(2, headerCells.length, ...tableRows.map((row) => row.length));
      const renderCells = (row: string[], style: string) =>
        Array.from({ length: columnCount }, (_, cellIndex) => {
          const content = applyInlineTokenStyles(parseInlineMarkdown(row[cellIndex] || ''), textColor, accentColor, accentSoftColor);
          return `<div style="${style};width:${(100 / columnCount).toFixed(4)}%;">${content}</div>`;
        }).join('');
      blocks.push(`<div style="${tableStyle}"><div style="${tableRowStyle}">${renderCells(headerCells, thStyle)}</div>${tableRows.map((row) => `<div style="${tableRowStyle}">${renderCells(row, tdStyle)}</div>`).join('')}</div>`);
      continue;
    }

    if (!trimmed) {
      closeLists();
      blocks.push(`<p class="md-spacer" style="${spacerStyle}"></p>`);
      index += 1;
      continue;
    }

    const hMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (hMatch) {
      closeLists();
      const level = Math.min(3, hMatch[1].length);
      const headingStyle = level === 1 ? h1Style : level === 2 ? h2Style : h3Style;
      blocks.push(`<h${level} style="${headingStyle}">${applyInlineTokenStyles(parseInlineMarkdown(hMatch[2]), textColor, accentColor, accentSoftColor)}</h${level}>`);
      index += 1;
      continue;
    }

    const quoteMatch = trimmed.match(/^>\s*(.+)$/);
    if (quoteMatch) {
      closeLists();
      blocks.push(`<blockquote style="${quoteStyle}">${applyInlineTokenStyles(parseInlineMarkdown(quoteMatch[1]), textColor, accentColor, accentSoftColor)}</blockquote>`);
      index += 1;
      continue;
    }

    const ulMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (ulMatch) {
      if (inOl) {
        blocks.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        inUl = true;
        blocks.push(`<ul style="${ulStyle}">`);
      }
      blocks.push(`<li style="${liStyle}">${applyInlineTokenStyles(parseInlineMarkdown(ulMatch[1]), textColor, accentColor, accentSoftColor)}</li>`);
      index += 1;
      continue;
    }

    const olMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (olMatch) {
      if (inUl) {
        blocks.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        inOl = true;
        blocks.push(`<ol start="${escapeAttr(olMatch[1])}" style="${ulStyle}">`);
      }
      blocks.push(`<li style="${liStyle}">${applyInlineTokenStyles(parseInlineMarkdown(olMatch[2]), textColor, accentColor, accentSoftColor)}</li>`);
      index += 1;
      continue;
    }

    const hrMatch = trimmed.match(/^(-{3,}|\*{3,}|_{3,})$/);
    if (hrMatch) {
      closeLists();
      blocks.push(`<hr style="${hrStyle}" />`);
      index += 1;
      continue;
    }

    const imageMatch = trimmed.match(/^!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)$/);
    if (imageMatch) {
      closeLists();
      blocks.push(`<img class="md-image" style="${imageStyle}" src="${escapeAttr(imageMatch[2])}" alt="${escapeAttr(imageMatch[1])}" />`);
      index += 1;
      continue;
    }

    closeLists();
    blocks.push(`<p style="${bodyStyle}">${applyInlineTokenStyles(parseInlineMarkdown(trimmed), textColor, accentColor, accentSoftColor)}</p>`);
    index += 1;
  }

  closeLists();
  if (inCode) blocks.push('</code></pre>');
  const familyStyle = CARD_FONT_FAMILY_STACK_MAP[fontFamily] || CARD_FONT_FAMILY_STACK_MAP.system;
  return `<div style="color:${textColor};font-family:${familyStyle};padding:${padding}px;">${blocks.join('')}</div>`;
}

function buildWechatArticleHtml(markdown: string, previewStyle: PreviewRenderStyle): string {
  const articleHtml = renderMiniMarkdown(markdown, {
    ...previewStyle,
    density: 'relaxed',
    padding: 'md',
    headingSpacing: 'normal',
  });
  const familyStyle = CARD_FONT_FAMILY_STACK_MAP[previewStyle.fontFamily] || CARD_FONT_FAMILY_STACK_MAP.system;
  return [
    '<section class="js-preview">',
    `<section class="card markdown-body wechat" style="font-family:${familyStyle};line-height:1.75;background:#ffffff;color:${previewStyle.textColor};padding:20px;word-wrap:break-word;font-size:16px;">`,
    articleHtml,
    '</section>',
    '</section>',
  ].join('');
}

function buildWechatPreviewHtml(markdown: string, previewStyle: PreviewRenderStyle): string {
  return renderMiniMarkdown(markdown, {
    ...previewStyle,
    density: 'relaxed',
    padding: 'md',
    headingSpacing: 'normal',
    spacingScale: 1.08,
  });
}

function renderMiniCoverPreview(
  coverStyleId: CardCoverStyleId,
  title: string,
  subtitle: string,
  background: string,
  textColor: string,
  accentColor: string,
  fontFamily: CardFontFamily,
  padding: number,
  alignX: 'left' | 'center' | 'right',
  alignY: 'top' | 'center' | 'bottom',
  titleFontSize: number,
  subtitleFontSize: number,
  lineHeight: number,
  showStickers: boolean,
  coverImage: string,
): string {
  const familyStyle = CARD_FONT_FAMILY_STACK_MAP[fontFamily] || CARD_FONT_FAMILY_STACK_MAP.system;
  const coverTitle = escapeHtml((title || '图文卡片').trim() || '图文卡片');
  const coverSubtitle = escapeHtml((subtitle || '').trim());
  const coverBackground = (background || '').trim() || 'linear-gradient(135deg,#f7f0d5 0%,#e9d89a 100%)';
  const outerPadding = Math.max(18, padding);
  const justifyContent = alignY === 'top' ? 'flex-start' : alignY === 'bottom' ? 'flex-end' : 'center';
  const textAlign = alignX;
  const alignItems = alignX === 'left' ? 'flex-start' : alignX === 'right' ? 'flex-end' : 'center';
  const contentMaxWidth = alignX === 'center' ? '92%' : '100%';
  const imageLayer = coverImage
    ? `background-image:url('${escapeAttr(coverImage)}');background-size:cover;background-position:center;opacity:0.34;`
    : '';
  const subtitleHtml = coverSubtitle
    ? `<div style="margin-top:14px;font-size:${Math.max(14, Math.round(subtitleFontSize * 0.38))}px;line-height:${Math.max(1.15, lineHeight - 0.1)};opacity:0.92;text-align:${textAlign};">${coverSubtitle}</div>`
    : '';
  const styleDecoration = (() => {
    switch (coverStyleId) {
      case 'grid-paper':
        return `<div style="position:absolute;inset:0;opacity:0.16;background-image:linear-gradient(0deg,rgba(0,0,0,0.22) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,0.22) 1px,transparent 1px);background-size:18px 18px;"></div>`;
      case 'rounded-gray-note':
        return `<div style="position:absolute;right:14px;top:12px;width:24px;height:24px;border-radius:999px;background:#ff7d87;opacity:0.9;"></div>`;
      case 'pastel-purple-cat':
        return `<div style="position:absolute;right:14px;top:10px;font-size:22px;line-height:1;">🐱</div>`;
      case 'warm-gray-dog':
        return `<div style="position:absolute;right:14px;top:10px;font-size:22px;line-height:1;">🐶</div>`;
      case 'lined-notebook':
        return `<div style="position:absolute;inset:0;opacity:0.2;background-image:repeating-linear-gradient(180deg,transparent 0,transparent 18px,rgba(0,0,0,0.3) 18px,rgba(0,0,0,0.3) 19px);"></div><div style="position:absolute;left:20px;top:0;bottom:0;width:2px;background:rgba(246,108,108,0.66);"></div>`;
      case 'lime-question':
        return `<div style="position:absolute;right:14px;top:10px;width:28px;height:28px;border-radius:999px;background:rgba(255,255,255,0.56);display:flex;align-items:center;justify-content:center;color:#3b3b2f;font-size:20px;font-weight:800;">?</div>`;
      case 'mint-splash':
        return `<div style="position:absolute;left:14px;top:14px;width:16px;height:16px;border-radius:999px;background:rgba(255,255,255,0.66);box-shadow:18px 6px 0 rgba(255,255,255,0.36),36px 2px 0 rgba(255,255,255,0.24);"></div>`;
      case 'image-focus':
      default:
        return `<div style="position:absolute;left:10px;right:10px;top:10px;bottom:10px;border:2px solid rgba(255,255,255,0.28);border-radius:10px;"></div><div style="position:absolute;left:0;right:0;top:0;height:10px;background:repeating-linear-gradient(90deg,rgba(0,0,0,0.35) 0 8px,rgba(255,255,255,0.08) 8px 14px);"></div>`;
    }
  })();
  const stickerHtml = showStickers
    ? `<div style="position:absolute;right:16px;top:14px;width:26px;height:26px;border-radius:999px;background:${accentColor};opacity:0.88;"></div>
       <div style="position:absolute;left:18px;bottom:16px;width:20px;height:20px;border-radius:999px;background:${accentColor};opacity:0.24;"></div>`
    : '';

  return `
    <div style="
      width:100%;
      min-height:100%;
      box-sizing:border-box;
      padding:${outerPadding}px;
      color:${textColor};
      font-family:${familyStyle};
      background:${coverBackground};
      display:flex;
      flex-direction:column;
      justify-content:${justifyContent};
      overflow:hidden;
      position:relative;
    ">
      <div style="position:absolute;inset:0;${imageLayer}"></div>
      ${styleDecoration}
      ${stickerHtml}
      <div style="
        display:inline-flex;
        align-self:flex-start;
        align-items:center;
        padding:4px 10px;
        border-radius:999px;
        background:rgba(255,255,255,0.24);
        color:${textColor};
        font-size:12px;
        font-weight:700;
        letter-spacing:2px;
      ">封面</div>
      <div style="
        margin-top:18px;
        padding-top:20px;
        width:${contentMaxWidth};
        align-self:${alignItems};
      ">
        <div style="
          width:34px;
          height:4px;
          border-radius:999px;
          background:${accentColor};
          margin-bottom:14px;
          margin-left:${alignX === 'center' ? 'auto' : '0'};
          margin-right:${alignX === 'right' ? '0' : 'auto'};
        "></div>
        <div style="
          font-size:${Math.max(26, Math.round(titleFontSize * 0.42))}px;
          line-height:${Math.max(1.08, lineHeight - 0.12)};
          font-weight:800;
          white-space:pre-wrap;
          word-break:break-word;
          text-shadow:0 0 0 ${accentColor};
          text-align:${textAlign};
        ">${coverTitle}</div>
        ${subtitleHtml}
      </div>
    </div>
  `;
}

function stripPreviewFrontmatter(markdown: string): string {
  const source = (markdown || '').replace(/\r\n/g, '\n');
  if (!source.startsWith('---\n')) return source;

  const end = source.indexOf('\n---\n', 4);
  if (end === -1) return source;
  return source.slice(end + 5);
}

function estimateTextWidthUnits(text: string): number {
  if (!text) return 0;
  let units = 0;
  for (const ch of text) {
    if (/\s/.test(ch)) {
      units += 0.34;
      continue;
    }
    if (/[A-Za-z0-9]/.test(ch)) {
      units += 0.58;
      continue;
    }
    if (/[,.!?;:'"(){}\[\]<>/\\|`~@#$%^&*_+=-]/.test(ch)) {
      units += 0.42;
      continue;
    }
    units += 1;
  }
  return units;
}

function estimateWrapCount(text: string, fontSizePx: number, contentWidthPx: number): number {
  const width = Math.max(72, contentWidthPx);
  const units = Math.max(1, estimateTextWidthUnits(text));
  const pxPerUnit = Math.max(7, fontSizePx * 0.94);
  return Math.max(1, Math.ceil((units * pxPerUnit) / width));
}

function paginatePreviewMarkdown(
  markdown: string,
  _maxPages: number,
  density: CardDensity,
  h1FontScale: CardFontScale,
  h2FontScale: CardFontScale,
  h3FontScale: CardFontScale,
  bodyFontScale: CardFontScale,
  padding: CardPadding,
  styleId: CardStyleId,
  styleLayout: CardStyleLayoutParams,
  windowWidthPx: number,
): string[] {
  const cleaned = stripPreviewFrontmatter(markdown)
    .replace(/<\/?details[^>]*>/gi, '')
    .replace(/<\/?summary[^>]*>/gi, '');

  const rawLines = cleaned.split('\n');
  const lines = rawLines.map((line) => line.trimEnd());

  while (lines.length > 0 && !lines[0].trim()) lines.shift();
  while (lines.length > 0 && !lines[lines.length - 1].trim()) lines.pop();

  const fallbackLines = ['# 标题示例', '', '请在编辑区输入内容'];
  const contentLines = lines.length > 0 ? lines : fallbackLines;

  const h1ScaleFactor = CARD_FONT_SCALE_FACTOR_MAP[h1FontScale] || 1;
  const h2ScaleFactor = CARD_FONT_SCALE_FACTOR_MAP[h2FontScale] || 1;
  const h3ScaleFactor = CARD_FONT_SCALE_FACTOR_MAP[h3FontScale] || 1;
  const bodyScaleFactor = CARD_FONT_SCALE_FACTOR_MAP[bodyFontScale] || 1;
  const px = (size: number, factor: number = 1, min: number = 10) => Math.max(min, Math.round(size * factor));
  const spacingScale = Math.max(0.78, Math.min(1.36, styleLayout.spacing || 1));
  const lineHeight = (density === 'compact' ? 1.5 : density === 'relaxed' ? 1.72 : 1.6) * Math.max(0.94, Math.min(1.12, spacingScale));
  const paragraphGap = Math.round((density === 'compact' ? 6 : density === 'relaxed' ? 12 : 8) * spacingScale);
  const listGap = Math.round((density === 'compact' ? 3 : density === 'relaxed' ? 7 : 5) * spacingScale);
  const headingBottom = 8;
  const headingTop = 9;
  const markdownPaddingPx = padding === 'xs' ? 10 : padding === 'sm' ? 14 : padding === 'lg' ? 24 : 18;
  const bodyFontPx = px(14, bodyScaleFactor, 11);
  const h1FontPx = px(20, h1ScaleFactor, 15);
  const h2FontPx = px(18, h2ScaleFactor, 14);
  const h3FontPx = px(16, h3ScaleFactor, 13);
  const quoteFontPx = px(13, bodyScaleFactor, 11);
  const codeFontPx = px(12, bodyScaleFactor, 10);

  const safeWindowWidthPx = Math.max(320, windowWidthPx || 375);
  const rpxScale = safeWindowWidthPx / 750;
  const cardHeightPx = 980 * rpxScale;
  const pageHorizontalPaddingPx = 24 * rpxScale * 2;
  const previewCardPaddingXPx = styleId === 'coil-notebook'
    ? (96 + 40) * rpxScale
    : 22 * rpxScale * 2;
  const previewCardPaddingYPx = styleId === 'coil-notebook'
    ? (42 + 40) * rpxScale
    : 22 * rpxScale * 2;
  const contentShellPadXPx = Math.max(0, (styleLayout.contentPaddingX ?? (styleId === 'apple-notes' ? 0 : 20)) * rpxScale * 2);
  const contentShellPadYPx = Math.max(0, (styleLayout.contentPaddingY ?? (styleId === 'apple-notes' ? 0 : 18)) * rpxScale * 2);
  const headerDeductPx = Math.max(0, (styleLayout.headerHeight || 0) * rpxScale);
  const footerDeductPx = Math.max(0, (styleLayout.footerHeight || 0) * rpxScale);

  const pageWidthPx = Math.max(260, safeWindowWidthPx - pageHorizontalPaddingPx);
  const cardInnerWidthPx = Math.max(200, pageWidthPx - previewCardPaddingXPx);
  const cardInnerHeightPx = Math.max(200, cardHeightPx - previewCardPaddingYPx);
  const richTextWidthPx = Math.max(120, cardInnerWidthPx - contentShellPadXPx - markdownPaddingPx * 2);
  const richTextHeightPx = Math.max(180, cardInnerHeightPx - contentShellPadYPx - headerDeductPx - footerDeductPx - markdownPaddingPx * 2 - 6);
  const bodyLinePx = Math.max(12, bodyFontPx * lineHeight);
  const maxUnits = richTextHeightPx / bodyLinePx;

  const estimateLineWeight = (line: string, inCode: boolean): number => {
    const trimmed = (line || '').trim();
    if (!trimmed) return 8 / bodyLinePx;
    if (/^```/.test(trimmed)) return 1.05;
    if (inCode) return Math.max(0.9, (codeFontPx * 1.46) / bodyLinePx);

    if (isMiniMarkdownTableRow(trimmed)) {
      return Math.max(0.85, (bodyFontPx * 1.55 + 12) / bodyLinePx);
    }

    const h1Match = trimmed.match(/^#\s+(.+)$/);
    if (h1Match) {
      const wrap = estimateWrapCount(h1Match[1], h1FontPx, richTextWidthPx);
      return ((wrap * h1FontPx * 1.34) + (headingBottom + 3)) / bodyLinePx;
    }
    const h2Match = trimmed.match(/^##\s+(.+)$/);
    if (h2Match) {
      const wrap = estimateWrapCount(h2Match[1], h2FontPx, richTextWidthPx);
      return ((wrap * h2FontPx * 1.4) + headingTop + headingBottom) / bodyLinePx;
    }
    const h3Match = trimmed.match(/^#{3,6}\s+(.+)$/);
    if (h3Match) {
      const wrap = estimateWrapCount(h3Match[1], h3FontPx, richTextWidthPx);
      return ((wrap * h3FontPx * 1.42) + Math.max(5, headingTop - 1) + Math.max(3, headingBottom - 1)) / bodyLinePx;
    }
    const quoteMatch = trimmed.match(/^>\s*(.+)$/);
    if (quoteMatch) {
      const quoteWidthPx = Math.max(100, richTextWidthPx - 18);
      const wrap = estimateWrapCount(quoteMatch[1], quoteFontPx, quoteWidthPx);
      const quoteLineHeight = Math.max(1.35, lineHeight - 0.12);
      const quoteBlockPx = (wrap * quoteFontPx * quoteLineHeight) + (paragraphGap * 2) + 12;
      return quoteBlockPx / bodyLinePx;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      return 21 / bodyLinePx;
    }
    if (/^!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)$/.test(trimmed)) {
      const imageHeightPx = Math.max(60, richTextWidthPx * 0.56);
      return (imageHeightPx + 12) / bodyLinePx;
    }
    const listMatch = trimmed.match(/^([-*]|\d+\.)\s+(.+)$/);
    if (listMatch) {
      const listWidthPx = Math.max(96, richTextWidthPx - 24);
      const wrap = estimateWrapCount(listMatch[2], bodyFontPx, listWidthPx);
      return ((wrap * bodyFontPx * lineHeight) + listGap + 2) / bodyLinePx;
    }

    const wrap = estimateWrapCount(trimmed, bodyFontPx, richTextWidthPx);
    return ((wrap * bodyFontPx * lineHeight) + paragraphGap) / bodyLinePx;
  };

  const pages: string[] = [];
  let currentLines: string[] = [];
  let currentUnits = 0;
  let inCode = false;

  for (const line of contentLines) {
    const isFence = /^```/.test(line.trim());
    const weight = estimateLineWeight(line, inCode);
    if (currentLines.length > 0 && currentUnits + weight > maxUnits) {
      pages.push(currentLines.join('\n'));
      currentLines = [line];
      currentUnits = weight;
      if (isFence) inCode = !inCode;
      continue;
    }
    currentLines.push(line);
    currentUnits += weight;
    if (isFence) inCode = !inCode;
  }

  if (currentLines.length > 0) {
    pages.push(currentLines.join('\n'));
  }

  const mergedPages = pages
    .map((page) => page.trim())
    .filter(Boolean);

  return mergedPages;
}

export default function ImageGeneratePage() {
  const [activeFeature, setActiveFeature] = useState<FeatureKey>('ai-image');
  const [returnTarget, setReturnTarget] = useState('');
  const [hotRewriteReturnTaskId, setHotRewriteReturnTaskId] = useState('');
  const [hotRewriteReturnMode, setHotRewriteReturnMode] = useState('');
  const [hotRewriteViewGenerated, setHotRewriteViewGenerated] = useState(false);
  const [windowWidthPx, setWindowWidthPx] = useState(375);

  const [refImages, setRefImages] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState(IMAGE_MODELS[0].key);
  const [selectedImageAspect, setSelectedImageAspect] = useState<ImageAspectRatio>(IMAGE_ASPECT_OPTIONS[0].key);
  const [aiPrompt, setAiPrompt] = useState('');

  const [infographicTemplates, setInfographicTemplates] = useState<InfographicTemplate[]>(FALLBACK_INFOGRAPHIC_TEMPLATES);
  const [selectedTemplate, setSelectedTemplate] = useState(FALLBACK_INFOGRAPHIC_TEMPLATES[0].id);
  const [infographicCount, setInfographicCount] = useState(3);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [infoContent, setInfoContent] = useState('');
  const [infoSubmitting, setInfoSubmitting] = useState(false);
  const [aiSubmitting, setAiSubmitting] = useState(false);
  const aiSubmitLockedRef = useRef(false);

  const [selectedCardStyle, setSelectedCardStyle] = useState<CardStyleId>(CARD_LAYOUT_STYLES[0].id);
  const [selectedCardStyleMode, setSelectedCardStyleMode] = useState<CardStyleModeId>('');
  const [cardMarkdown, setCardMarkdown] = useState(CARD_LAYOUT_STYLES[0].defaultMarkdown);
  const [cardIncludeCover, setCardIncludeCover] = useState(true);
  const [cardMaxPages, setCardMaxPages] = useState(8);
  const [cardDensity, setCardDensity] = useState<CardDensity>('balanced');
  const [cardH1FontScale, setCardH1FontScale] = useState<CardFontScale>('md');
  const [cardH2FontScale, setCardH2FontScale] = useState<CardFontScale>('md');
  const [cardH3FontScale, setCardH3FontScale] = useState<CardFontScale>('md');
  const [cardBodyFontScale, setCardBodyFontScale] = useState<CardFontScale>('md');
  const [cardThemeColor, setCardThemeColor] = useState<CardThemeColor>('amber');
  const [cardRadius, setCardRadius] = useState<CardRadius>('md');
  const [cardHeadingSpacing, setCardHeadingSpacing] = useState<CardHeadingSpacing>('normal');
  const [cardPadding, setCardPadding] = useState<CardPadding>('md');
  const [cardFontFamily, setCardFontFamily] = useState<CardFontFamily>('system');
  const [cardCoverMode, setCardCoverMode] = useState<CardCoverMode>('auto');
  const [cardCoverStyleId, setCardCoverStyleId] = useState<CardCoverStyleId>('image-focus');
  const [cardCoverImage, setCardCoverImage] = useState('');
  const [cardCoverTitle, setCardCoverTitle] = useState('');
  const [cardCoverSubtitle, setCardCoverSubtitle] = useState('');
  const [cardCoverTextColor, setCardCoverTextColor] = useState('#f6efe3');
  const [cardCoverHighlightColor, setCardCoverHighlightColor] = useState('#ffb347');
  const [cardCoverCardRadius, setCardCoverCardRadius] = useState(0);
  const [cardCoverShowStickers, setCardCoverShowStickers] = useState(false);
  const [cardCoverFontFamily, setCardCoverFontFamily] = useState(CARD_FONT_FAMILY_OPTIONS[0].id);
  const [cardCoverTitleAlignX, setCardCoverTitleAlignX] = useState<'left' | 'center' | 'right'>('center');
  const [cardCoverTitleAlignY, setCardCoverTitleAlignY] = useState<'top' | 'center' | 'bottom'>('center');
  const [cardCoverFontSize, setCardCoverFontSize] = useState(195);
  const [cardCoverSubtitleFontSize, setCardCoverSubtitleFontSize] = useState(96);
  const [cardCoverLineHeight, setCardCoverLineHeight] = useState(1.4);
  const [cardEditorMode, setCardEditorMode] = useState<CardEditorMode>('edit');
  const [cardSettingsOpen, setCardSettingsOpen] = useState(false);
  const [cardSubmitting, setCardSubmitting] = useState(false);
  const [cardOptimizing, setCardOptimizing] = useState(false);
  const [cardExporting, setCardExporting] = useState(false);
  const [cardPreviewImages, setCardPreviewImages] = useState<string[]>([]);
  const [cardPublishQrcode, setCardPublishQrcode] = useState('');
  const [cardPublishUrl, setCardPublishUrl] = useState('');
  const [cardPreviewPageIndex, setCardPreviewPageIndex] = useState(0);
  const [cardWechatMode, setCardWechatMode] = useState(false);
  const [cardWechatStyleId, setCardWechatStyleId] = useState<CardWechatStyleId>(CARD_WECHAT_STYLE_OPTIONS[0].id);
  const [injectedFromMyNote, setInjectedFromMyNote] = useState(false);
  const [cardUserCleared, setCardUserCleared] = useState(false);
  const [stylePresetScrollLeft, setStylePresetScrollLeft] = useState(0);
  const stylePresetScrollLeftRef = useRef(0);
  const routeFeatureOverrideRef = useRef<FeatureKey | null>(null);

  const applyCardCoverStyleDefaults = (styleId: CardCoverStyleId) => {
    const spec = getCardCoverStyleSpec(styleId);
    setCardCoverStyleId(spec.id);
    setCardCoverTextColor(spec.defaultTextColor);
    setCardCoverHighlightColor(spec.defaultHighlightColor);
    setCardCoverCardRadius(spec.defaultCardRadius);
    setCardCoverShowStickers(spec.defaultShowStickers);
  };

  const selectedCardStylePreset = useMemo(() => getCardStylePreset(selectedCardStyle), [selectedCardStyle]);
  const selectedCardStyleModePreset = useMemo(() => {
    const modes = selectedCardStylePreset.modes || [];
    if (modes.length === 0) return null;
    return modes.find((mode) => mode.id === selectedCardStyleMode) || modes[0];
  }, [selectedCardStyleMode, selectedCardStylePreset]);

  useEffect(() => {
    if (cardUserCleared) return;
    if (cardMarkdown.trim()) return;
    setCardMarkdown(selectedCardStylePreset.defaultMarkdown);
  }, [cardMarkdown, cardUserCleared, selectedCardStylePreset.defaultMarkdown]);

  useEffect(() => {
    const modes = selectedCardStylePreset.modes || [];
    if (modes.length === 0) {
      if (selectedCardStyleMode) setSelectedCardStyleMode('');
      return;
    }
    if (!modes.some((item) => item.id === selectedCardStyleMode)) {
      setSelectedCardStyleMode(modes[0].id);
    }
  }, [selectedCardStyleMode, selectedCardStylePreset]);

  const selectedInfographicTemplate = useMemo(
    () => infographicTemplates.find((tpl) => tpl.id === selectedTemplate) || infographicTemplates[0] || null,
    [infographicTemplates, selectedTemplate],
  );
  const selectedImageModelOption = useMemo(() => getImageModelOption(selectedModel), [selectedModel]);
  const maxAiReferenceImages = selectedImageModelOption.maxReferenceImages;

  useLoad((query) => {
    const from = String(query?.from || '').trim();
    if (from === 'action-transfer') {
      routeFeatureOverrideRef.current = 'ai-image';
      setReturnTarget('action-transfer');
      setActiveFeature('ai-image');
    }
    if (from === 'smart-copy') {
      const targetFeature = String(query?.targetFeature || '').trim();
      if (targetFeature === 'infographic' || targetFeature === 'card-layout') {
        routeFeatureOverrideRef.current = targetFeature;
        setActiveFeature(targetFeature);
      }
    }
    const origin = String(query?.origin || '').trim();
    if (origin === 'hot-rewrite') {
      setHotRewriteReturnTaskId(String(query?.taskId || '').trim());
      setHotRewriteReturnMode(String(query?.mode || '').trim());
      setHotRewriteViewGenerated(String(query?.viewGenerated || '').trim() === '1');
    }
  });

  useEffect(() => {
    try {
      const routeFeatureOverride = getRouteFeatureOverride();
      if (routeFeatureOverride) {
        routeFeatureOverrideRef.current = routeFeatureOverride;
        setActiveFeature(routeFeatureOverride);
      }

      const raw = Taro.getStorageSync(IMAGE_GENERATE_PREFS_KEY);
      if (!raw || typeof raw !== 'object') return;
      const prefs = raw as ImageGeneratePrefs;

      if (!routeFeatureOverride && !routeFeatureOverrideRef.current && prefs.activeFeature && FEATURE_TABS.some((item) => item.key === prefs.activeFeature)) {
        setActiveFeature(prefs.activeFeature);
      }
      if (prefs.selectedModel && IMAGE_MODELS.some((item) => item.key === prefs.selectedModel)) {
        setSelectedModel(prefs.selectedModel);
      }
      if (prefs.selectedImageAspect && IMAGE_ASPECT_OPTIONS.some((item) => item.key === prefs.selectedImageAspect)) {
        setSelectedImageAspect(prefs.selectedImageAspect);
      }
      if (prefs.selectedTemplate && typeof prefs.selectedTemplate === 'string') {
        setSelectedTemplate(prefs.selectedTemplate);
      }
      if (typeof prefs.infographicCount === 'number' && INFOGRAPHIC_COUNT_OPTIONS.includes(prefs.infographicCount)) {
        setInfographicCount(prefs.infographicCount);
      }
      const resolvedStyleId = resolveCardStyleId(prefs.selectedCardStyle);
      setSelectedCardStyle(resolvedStyleId);
      const stylePreset = getCardStylePreset(resolvedStyleId);
      if (prefs.selectedCardStyleMode && stylePreset.modes?.some((item) => item.id === prefs.selectedCardStyleMode)) {
        setSelectedCardStyleMode(prefs.selectedCardStyleMode);
      } else if (stylePreset.modes?.[0]) {
        setSelectedCardStyleMode(stylePreset.modes[0].id);
      }
      if (typeof prefs.cardIncludeCover === 'boolean') {
        setCardIncludeCover(prefs.cardIncludeCover);
      }
      if (typeof prefs.cardMaxPages === 'number' && CARD_MAX_PAGE_OPTIONS.includes(prefs.cardMaxPages)) {
        setCardMaxPages(prefs.cardMaxPages);
      }
      if (prefs.cardDensity && CARD_DENSITY_OPTIONS.some((item) => item.id === prefs.cardDensity)) {
        setCardDensity(prefs.cardDensity);
      }
      if (prefs.cardH1FontScale && CARD_FONT_SCALE_OPTIONS.some((item) => item.id === prefs.cardH1FontScale)) {
        setCardH1FontScale(prefs.cardH1FontScale);
      }
      if (prefs.cardH2FontScale && CARD_FONT_SCALE_OPTIONS.some((item) => item.id === prefs.cardH2FontScale)) {
        setCardH2FontScale(prefs.cardH2FontScale);
      }
      if (prefs.cardH3FontScale && CARD_FONT_SCALE_OPTIONS.some((item) => item.id === prefs.cardH3FontScale)) {
        setCardH3FontScale(prefs.cardH3FontScale);
      }
      if (prefs.cardBodyFontScale && CARD_FONT_SCALE_OPTIONS.some((item) => item.id === prefs.cardBodyFontScale)) {
        setCardBodyFontScale(prefs.cardBodyFontScale);
      }
      if (!prefs.cardH1FontScale && !prefs.cardH2FontScale && !prefs.cardH3FontScale && prefs.cardHeadingFontScale && CARD_FONT_SCALE_OPTIONS.some((item) => item.id === prefs.cardHeadingFontScale)) {
        setCardH1FontScale(prefs.cardHeadingFontScale);
        setCardH2FontScale(prefs.cardHeadingFontScale);
        setCardH3FontScale(prefs.cardHeadingFontScale);
      }
      if (!prefs.cardH1FontScale && !prefs.cardH2FontScale && !prefs.cardH3FontScale && !prefs.cardBodyFontScale && prefs.cardFontScale && CARD_FONT_SCALE_OPTIONS.some((item) => item.id === prefs.cardFontScale)) {
        setCardH1FontScale(prefs.cardFontScale);
        setCardH2FontScale(prefs.cardFontScale);
        setCardH3FontScale(prefs.cardFontScale);
        setCardBodyFontScale(prefs.cardFontScale);
      }
      if (prefs.cardThemeColor && CARD_THEME_COLOR_OPTIONS.some((item) => item.id === prefs.cardThemeColor)) {
        setCardThemeColor(prefs.cardThemeColor);
      }
      if (prefs.cardRadius && CARD_RADIUS_OPTIONS.some((item) => item.id === prefs.cardRadius)) {
        setCardRadius(prefs.cardRadius);
      }
      if (prefs.cardHeadingSpacing && CARD_HEADING_SPACING_OPTIONS.some((item) => item.id === prefs.cardHeadingSpacing)) {
        setCardHeadingSpacing(prefs.cardHeadingSpacing);
      }
      if (prefs.cardPadding && CARD_PADDING_OPTIONS.some((item) => item.id === prefs.cardPadding)) {
        setCardPadding(prefs.cardPadding);
      }
      if (prefs.cardFontFamily && CARD_FONT_FAMILY_OPTIONS.some((item) => item.id === prefs.cardFontFamily)) {
        setCardFontFamily(prefs.cardFontFamily);
      }
      if (prefs.cardCoverMode && CARD_COVER_MODE_OPTIONS.some((item) => item.id === prefs.cardCoverMode)) {
        setCardCoverMode(prefs.cardCoverMode);
      }
      if (prefs.cardCoverStyleId && CARD_COVER_STYLE_OPTIONS.some((item) => item.id === prefs.cardCoverStyleId)) {
        const styleSpec = getCardCoverStyleSpec(prefs.cardCoverStyleId);
        setCardCoverStyleId(styleSpec.id);
        setCardCoverTextColor(styleSpec.defaultTextColor);
        setCardCoverHighlightColor(styleSpec.defaultHighlightColor);
        setCardCoverCardRadius(styleSpec.defaultCardRadius);
        setCardCoverShowStickers(styleSpec.defaultShowStickers);
      }
      if (typeof prefs.cardCoverImage === 'string') {
        setCardCoverImage(prefs.cardCoverImage);
      }
      if (typeof prefs.cardCoverTitle === 'string') {
        setCardCoverTitle(prefs.cardCoverTitle.slice(0, 30));
      }
      if (typeof prefs.cardCoverSubtitle === 'string') {
        setCardCoverSubtitle(prefs.cardCoverSubtitle.slice(0, 40));
      }
      if (typeof prefs.cardCoverTextColor === 'string') {
        setCardCoverTextColor(prefs.cardCoverTextColor);
      }
      if (typeof prefs.cardCoverHighlightColor === 'string') {
        setCardCoverHighlightColor(prefs.cardCoverHighlightColor);
      }
      if (typeof prefs.cardCoverCardRadius === 'number') {
        setCardCoverCardRadius(clampNumber(prefs.cardCoverCardRadius, COVER_CARD_RADIUS_MIN, COVER_CARD_RADIUS_MAX));
      }
      if (typeof prefs.cardCoverShowStickers === 'boolean') {
        setCardCoverShowStickers(prefs.cardCoverShowStickers);
      }
      if (prefs.cardCoverFontFamily && CARD_FONT_FAMILY_OPTIONS.some((item) => item.id === prefs.cardCoverFontFamily)) {
        setCardCoverFontFamily(prefs.cardCoverFontFamily);
      }
      if (prefs.cardCoverTitleAlignX && CARD_COVER_TITLE_ALIGN_X_OPTIONS.some((item) => item.id === prefs.cardCoverTitleAlignX)) {
        setCardCoverTitleAlignX(prefs.cardCoverTitleAlignX);
      }
      if (prefs.cardCoverTitleAlignY && CARD_COVER_TITLE_ALIGN_Y_OPTIONS.some((item) => item.id === prefs.cardCoverTitleAlignY)) {
        setCardCoverTitleAlignY(prefs.cardCoverTitleAlignY);
      }
      if (typeof prefs.cardCoverFontSize === 'number') {
        setCardCoverFontSize(clampNumber(prefs.cardCoverFontSize, COVER_TITLE_FONT_SIZE_MIN, COVER_TITLE_FONT_SIZE_MAX));
      }
      if (typeof prefs.cardCoverSubtitleFontSize === 'number') {
        setCardCoverSubtitleFontSize(clampNumber(prefs.cardCoverSubtitleFontSize, COVER_SUBTITLE_FONT_SIZE_MIN, COVER_SUBTITLE_FONT_SIZE_MAX));
      }
      if (typeof prefs.cardCoverLineHeight === 'number') {
        setCardCoverLineHeight(clampNumber(prefs.cardCoverLineHeight, COVER_LINE_HEIGHT_MIN, COVER_LINE_HEIGHT_MAX));
      }
      if (prefs.cardEditorMode && (prefs.cardEditorMode === 'edit' || prefs.cardEditorMode === 'preview')) {
        setCardEditorMode(prefs.cardEditorMode);
      }
      if (typeof prefs.cardWechatMode === 'boolean') {
        setCardWechatMode(prefs.cardWechatMode);
      }
      if (prefs.cardWechatStyleId && CARD_WECHAT_STYLE_OPTIONS.some((item) => item.id === prefs.cardWechatStyleId)) {
        setCardWechatStyleId(prefs.cardWechatStyleId);
      }
    } catch {
      // ignore broken local prefs
    }
  }, []);

  useEffect(() => {
    const prefs: ImageGeneratePrefs = {
      activeFeature,
      selectedModel,
      selectedImageAspect,
      selectedTemplate,
      infographicCount,
      selectedCardStyle,
      selectedCardStyleMode,
      cardIncludeCover,
      cardMaxPages,
      cardDensity,
      cardH1FontScale,
      cardH2FontScale,
      cardH3FontScale,
      cardBodyFontScale,
      cardThemeColor,
      cardRadius,
      cardHeadingSpacing,
      cardPadding,
      cardFontFamily,
      cardCoverMode,
      cardCoverStyleId,
      cardCoverImage,
      cardCoverTitle,
      cardCoverSubtitle,
      cardCoverTextColor,
      cardCoverHighlightColor,
      cardCoverCardRadius,
      cardCoverShowStickers,
      cardCoverFontFamily,
      cardCoverTitleAlignX,
      cardCoverTitleAlignY,
      cardCoverFontSize,
      cardCoverSubtitleFontSize,
      cardCoverLineHeight,
      cardEditorMode,
      cardWechatMode,
      cardWechatStyleId,
    };
    Taro.setStorageSync(IMAGE_GENERATE_PREFS_KEY, prefs);
  }, [
    activeFeature,
    selectedModel,
    selectedImageAspect,
    selectedTemplate,
    infographicCount,
    selectedCardStyle,
    selectedCardStyleMode,
    cardIncludeCover,
    cardMaxPages,
    cardDensity,
    cardH1FontScale,
    cardH2FontScale,
    cardH3FontScale,
    cardBodyFontScale,
    cardThemeColor,
    cardRadius,
    cardHeadingSpacing,
    cardPadding,
    cardFontFamily,
    cardCoverMode,
    cardCoverStyleId,
    cardCoverImage,
    cardCoverTitle,
    cardCoverSubtitle,
    cardCoverTextColor,
    cardCoverHighlightColor,
    cardCoverCardRadius,
    cardCoverShowStickers,
    cardCoverFontFamily,
    cardCoverTitleAlignX,
    cardCoverTitleAlignY,
    cardCoverFontSize,
    cardCoverSubtitleFontSize,
    cardCoverLineHeight,
    cardEditorMode,
    cardWechatMode,
    cardWechatStyleId,
  ]);

  const loadInfographicTemplates = async () => {
    if (templatesLoading) return;
    setTemplatesLoading(true);
    try {
      const styles = await miniappApi.listStylePresets('xhs-visual');
      if (!Array.isArray(styles) || styles.length === 0) return;

      const mapped: InfographicTemplate[] = styles.map((style, idx) => ({
        id: style.id,
        title: style.name || `模板${idx + 1}`,
        tag: style.status === 'FAILED' ? '不可用' : '风格模板',
        preview: style.thumbnailUrl || style.previewUrl || FALLBACK_INFOGRAPHIC_TEMPLATES[idx % FALLBACK_INFOGRAPHIC_TEMPLATES.length].preview,
        status: style.status,
        metadata: style.metadata ?? null,
        spec: style.spec ?? null,
      }));

      setInfographicTemplates(mapped);
      if (!mapped.some((tpl) => tpl.id === selectedTemplate)) {
        const firstValid = mapped.find((tpl) => tpl.status !== 'FAILED') || mapped[0];
        setSelectedTemplate(firstValid.id);
      }
    } catch {
      // use fallback templates
    } finally {
      setTemplatesLoading(false);
    }
  };

  useDidShow(() => {
    setCardSettingsOpen(false);
    const routeFeatureOverride = getRouteFeatureOverride();
    if (routeFeatureOverride) {
      routeFeatureOverrideRef.current = routeFeatureOverride;
      setActiveFeature(routeFeatureOverride);
    }
    void loadInfographicTemplates();

    const smartCopyRaw = Taro.getStorageSync(SMART_COPY_CARD_PAYLOAD_KEY);
    if (smartCopyRaw && typeof smartCopyRaw === 'object') {
      const payload = smartCopyRaw as {
        targetFeature?: 'infographic' | 'card-layout';
        title?: string;
        body?: string;
      };
      const title = cleanMyNoteCardText(String(payload.title || ''));
      const body = cleanMyNoteCardText(String(payload.body || ''));
      const mergedText = [title ? `# ${title}` : '', body].filter(Boolean).join('\n\n');
      if (payload.targetFeature === 'infographic') {
        setActiveFeature('infographic');
        if (mergedText) setInfoContent(mergedText);
      } else {
        setActiveFeature('card-layout');
        if (mergedText) {
          setCardUserCleared(false);
          setCardMarkdown(mergedText);
        }
      }
      Taro.removeStorageSync(SMART_COPY_CARD_PAYLOAD_KEY);
      return;
    }

    // Optional prefill from "我的笔记仿写结果"
    if (!injectedFromMyNote && !hotRewriteViewGenerated) {
      const raw = Taro.getStorageSync('MY_NOTE_REWRITE_PAYLOAD');
      if (raw && typeof raw === 'object') {
        const payload = raw as {
          targetFeature?: 'infographic' | 'card-layout';
          title?: string;
          body?: string;
          imageTexts?: string[];
        };
        const target = payload.targetFeature === 'infographic' ? 'infographic' : 'card-layout';
        const title = cleanMyNoteCardText(String(payload.title || ''));
        const body = cleanMyNoteCardText(String(payload.body || ''));
        const imageTexts = Array.isArray(payload.imageTexts)
          ? payload.imageTexts.map((item) => cleanMyNoteCardText(String(item || ''))).filter(Boolean)
          : [];
        const lines = [
          title ? `# ${title}` : '',
          body,
          ...imageTexts,
        ].filter(Boolean);

        const mergedText = lines.join('\n\n');
        if (target === 'infographic') {
          setActiveFeature('infographic');
          if (mergedText) setInfoContent(mergedText);
        } else {
          setActiveFeature('card-layout');
          if (mergedText) {
            setCardUserCleared(false);
            setCardMarkdown(mergedText);
          }
        }
        setInjectedFromMyNote(true);
        Taro.removeStorageSync('MY_NOTE_REWRITE_PAYLOAD');
      }
    }

    if (routeFeatureOverride === 'card-layout' && hotRewriteViewGenerated) {
      const previewImagesRaw = Taro.getStorageSync('CARD_LAYOUT_PREVIEW_IMAGES');
      const previewImages = Array.isArray(previewImagesRaw)
        ? previewImagesRaw.map((item) => String(item || '').trim()).filter(Boolean)
        : [];
      const previewMarkdown = String(Taro.getStorageSync('CARD_LAYOUT_PREVIEW_MD') || '').trim();
      const qrcode = String(Taro.getStorageSync('CARD_LAYOUT_PUBLISH_QRCODE') || '').trim();
      if (previewImages.length > 0) {
        setCardPreviewImages(previewImages);
        setCardPreviewPageIndex(0);
        setCardEditorMode('preview');
      }
      if (previewMarkdown && !cardMarkdown.trim()) {
        setCardUserCleared(false);
        setCardMarkdown(previewMarkdown);
      }
      if (qrcode) setCardPublishQrcode(qrcode);
    }
  });

  useDidHide(() => {
    setCardUserCleared(false);
  });

  useEffect(() => {
    if (activeFeature !== 'card-layout' && cardSettingsOpen) {
      setCardSettingsOpen(false);
    }
  }, [activeFeature, cardSettingsOpen]);

  useEffect(() => {
    try {
      const info = Taro.getWindowInfo();
      if (info && typeof info.windowWidth === 'number' && info.windowWidth > 0) {
        setWindowWidthPx(info.windowWidth);
        return;
      }
    } catch {
      // ignore
    }
    try {
      const system = Taro.getSystemInfoSync();
      if (system && typeof system.windowWidth === 'number' && system.windowWidth > 0) {
        setWindowWidthPx(system.windowWidth);
      }
    } catch {
      // ignore
    }
  }, []);

  const selectedCardWechatStyle = useMemo(
    () => getCardWechatStyleSpec(cardWechatStyleId),
    [cardWechatStyleId],
  );

  const cardWechatPreviewStyle = useMemo<PreviewRenderStyle>(() => ({
    textColor: selectedCardWechatStyle.textColor,
    accentColor: selectedCardWechatStyle.accentColor,
    accentSoftColor: selectedCardWechatStyle.accentSoftColor,
    density: 'relaxed',
    h1FontScale: cardH1FontScale,
    h2FontScale: cardH2FontScale,
    h3FontScale: cardH3FontScale,
    bodyFontScale: cardBodyFontScale,
    headingSpacing: 'normal',
    padding: 'md',
    fontFamily: cardFontFamily,
    spacingScale: 1.08,
  }), [cardBodyFontScale, cardFontFamily, cardH1FontScale, cardH2FontScale, cardH3FontScale, selectedCardWechatStyle]);

  const cardWechatPreviewHtml = useMemo(() => {
    const renderSourceMarkdown = cleanMyNoteCardText(cardMarkdown).trim() || '# 图文卡片\n\n请在编辑区输入内容。';
    return buildWechatPreviewHtml(renderSourceMarkdown, cardWechatPreviewStyle);
  }, [cardMarkdown, cardWechatPreviewStyle]);

  const cardPreviewPages = useMemo(() => {
    try {
      const renderSourceMarkdown = cleanMyNoteCardText(cardMarkdown);
      const styleLayout = CARD_STYLE_LAYOUT_PARAMS[selectedCardStylePreset.id];
      const styleThemeSpec = CARD_PREVIEW_THEME_SPEC_MAP[selectedCardStylePreset.id];
      const modeId = selectedCardStyleModePreset?.id || '';
      const textColor = styleThemeSpec?.modeTextColor?.[modeId]
        || styleThemeSpec?.textColor
        || selectedCardStyleModePreset?.textColor
        || selectedCardStylePreset.textColor;
      const accentColorByTheme = CARD_THEME_ACCENT_MAP[cardThemeColor] || CARD_THEME_ACCENT_MAP.amber;
      const accentColor = selectedCardStyleModePreset?.accentColor || selectedCardStylePreset.accentColor || accentColorByTheme;
      const pageMarkdown = paginatePreviewMarkdown(
        renderSourceMarkdown,
        cardMaxPages,
        cardDensity,
        cardH1FontScale,
        cardH2FontScale,
        cardH3FontScale,
        cardBodyFontScale,
        cardPadding,
        selectedCardStylePreset.id,
        styleLayout,
        windowWidthPx,
      );
      const previewStyle: PreviewRenderStyle = {
        textColor: textColor || '#1f2937',
        accentColor,
        accentSoftColor: CARD_THEME_ACCENT_SOFT_MAP[cardThemeColor] || CARD_THEME_ACCENT_SOFT_MAP.amber,
        density: cardDensity,
        h1FontScale: cardH1FontScale,
        h2FontScale: cardH2FontScale,
        h3FontScale: cardH3FontScale,
        bodyFontScale: cardBodyFontScale,
        headingSpacing: cardHeadingSpacing,
        padding: cardPadding,
        fontFamily: cardFontFamily,
        spacingScale: styleLayout.spacing,
      };
      const pages = pageMarkdown.map((md) => renderMiniMarkdown(md, previewStyle)).filter(Boolean);
      if (cardIncludeCover) {
        pages.unshift(renderMiniCoverPreview(
          cardCoverStyleId,
          cardCoverPreviewTitle,
          cardCoverPreviewSubtitle,
          cardCoverPreviewBackground,
          cardCoverTextColor || textColor || '#1f2937',
          cardCoverHighlightColor || accentColor,
          cardCoverFontFamily || cardFontFamily,
          previewStyle.padding === 'xs' ? 10 : previewStyle.padding === 'sm' ? 14 : previewStyle.padding === 'lg' ? 24 : 18,
          cardCoverTitleAlignX,
          cardCoverTitleAlignY,
          cardCoverFontSize,
          cardCoverSubtitleFontSize,
          cardCoverLineHeight,
          cardCoverShowStickers,
          cardCoverImage,
        ));
      }
      if (pages.length > 0) return pages;
    } catch {
      // fallback below
    }
    return [renderMiniMarkdown('# 预览加载中\n\n请稍后再试或切换风格。', {
      textColor: '#1f2937',
      accentColor: CARD_THEME_ACCENT_MAP[cardThemeColor] || CARD_THEME_ACCENT_MAP.amber,
      accentSoftColor: CARD_THEME_ACCENT_SOFT_MAP[cardThemeColor] || CARD_THEME_ACCENT_SOFT_MAP.amber,
      density: 'balanced',
      h1FontScale: 'md',
      h2FontScale: 'md',
      h3FontScale: 'md',
      bodyFontScale: 'md',
      headingSpacing: 'normal',
      fontFamily: 'system',
    })];
  }, [cardDensity, cardH1FontScale, cardH2FontScale, cardH3FontScale, cardBodyFontScale, cardMarkdown, cardMaxPages, selectedCardStylePreset, selectedCardStyleModePreset, cardThemeColor, cardHeadingSpacing, cardPadding, cardFontFamily, cardIncludeCover, cardCoverPreviewTitle, cardCoverPreviewSubtitle, cardCoverPreviewBackground, cardCoverTextColor, cardCoverHighlightColor, cardCoverFontFamily, cardCoverTitleAlignX, cardCoverTitleAlignY, cardCoverFontSize, cardCoverSubtitleFontSize, cardCoverLineHeight, cardCoverShowStickers, cardCoverImage, windowWidthPx]);

  useEffect(() => {
    if (cardPreviewPageIndex > cardPreviewPages.length - 1) {
      setCardPreviewPageIndex(0);
    }
  }, [cardPreviewPageIndex, cardPreviewPages.length]);

  const cardPreviewThemeClass = useMemo(() => {
    if (cardWechatMode) {
      return `preview-card--wechat preview-card--wechat-${cardWechatStyleId} preview-card--font-${cardFontFamily}`;
    }
    const radiusClass = cardRadius === 'sm'
      ? 'preview-card--radius-sm'
      : cardRadius === 'lg'
        ? 'preview-card--radius-lg'
        : 'preview-card--radius-md';
    const colorClass = `preview-card--theme-${cardThemeColor}`;
    const spacingClass = cardHeadingSpacing === 'tight'
      ? 'preview-card--heading-tight'
      : cardHeadingSpacing === 'wide'
        ? 'preview-card--heading-wide'
        : 'preview-card--heading-normal';
    const paddingClass = cardPadding === 'xs'
      ? 'preview-card--padding-xs'
      : cardPadding === 'sm'
        ? 'preview-card--padding-sm'
        : cardPadding === 'lg'
          ? 'preview-card--padding-lg'
          : 'preview-card--padding-md';
    const fontClass = `preview-card--font-${cardFontFamily}`;
    const styleClass = `preview-card--style-${selectedCardStylePreset.id}`;
    const modeClass = selectedCardStyleModePreset?.id ? `preview-card--mode-${selectedCardStyleModePreset.id}` : '';
    return `${radiusClass} ${colorClass} ${spacingClass} ${paddingClass} ${fontClass} ${styleClass} ${modeClass}`.trim();
  }, [cardFontFamily, cardHeadingSpacing, cardPadding, cardRadius, cardThemeColor, cardWechatMode, cardWechatStyleId, selectedCardStyleModePreset?.id, selectedCardStylePreset.id]);
  const cardPreviewThemeInlineStyle = useMemo(() => {
    if (cardWechatMode) {
      return {
        backgroundColor: selectedCardWechatStyle.backgroundColor,
        color: selectedCardWechatStyle.textColor,
        borderColor: selectedCardWechatStyle.borderColor,
        '--preview-accent': selectedCardWechatStyle.accentColor,
        '--preview-accent-soft': selectedCardWechatStyle.accentSoftColor,
      } as Record<string, string>;
    }
    try {
      const styleLayout = CARD_STYLE_LAYOUT_PARAMS[selectedCardStylePreset.id];
      const styleThemeSpec = CARD_PREVIEW_THEME_SPEC_MAP[selectedCardStylePreset.id];
      const modeId = selectedCardStyleModePreset?.id || '';
      const background = styleThemeSpec?.modeBackground?.[modeId]
        || styleLayout?.background
        || styleThemeSpec?.cardBackground
        || selectedCardStyleModePreset?.previewBackground
        || selectedCardStylePreset.previewBackground;
      const textColor = styleThemeSpec?.modeTextColor?.[modeId]
        || styleLayout?.textColor
        || styleThemeSpec?.textColor
        || selectedCardStyleModePreset?.textColor
        || selectedCardStylePreset.textColor;
      const accentColor = selectedCardStyleModePreset?.accentColor
        || styleLayout?.accent
        || selectedCardStylePreset.accentColor
        || CARD_THEME_ACCENT_MAP[cardThemeColor]
        || CARD_THEME_ACCENT_MAP.amber;
      const accentSoftColor = CARD_THEME_ACCENT_SOFT_MAP[cardThemeColor] || CARD_THEME_ACCENT_SOFT_MAP.amber;
      const baseStyle = buildPreviewBackgroundStyle(background);
      const textureImage = CARD_STYLE_PREVIEW_IMAGE_MAP[selectedCardStylePreset.id];
      const inlineStyle: Record<string, string> = {
        ...baseStyle,
        color: textColor,
        '--preview-accent': accentColor,
        '--preview-accent-soft': accentSoftColor,
      };

      if (textureImage) {
        if (baseStyle.backgroundImage) {
          inlineStyle.backgroundImage = `url("${textureImage}"), ${baseStyle.backgroundImage}`;
          inlineStyle.backgroundSize = 'cover, cover';
          inlineStyle.backgroundPosition = 'center, center';
          inlineStyle.backgroundRepeat = 'no-repeat, no-repeat';
        } else {
          inlineStyle.backgroundImage = `url("${textureImage}")`;
          inlineStyle.backgroundSize = 'cover';
          inlineStyle.backgroundPosition = 'center';
          inlineStyle.backgroundRepeat = 'no-repeat';
        }
      }

      return {
        ...inlineStyle,
      } as Record<string, string>;
    } catch {
      return {
        backgroundColor: '#f5f5f5',
        color: '#1f2937',
      } as Record<string, string>;
    }
  }, [cardThemeColor, cardWechatMode, selectedCardStyleModePreset, selectedCardStylePreset, selectedCardWechatStyle]);

  const cardPreviewContentInlineStyle = useMemo(() => {
    if (cardWechatMode) {
      return {
        backgroundColor: selectedCardWechatStyle.backgroundColor,
        padding: '0',
      } as Record<string, string>;
    }
    const styleLayout = CARD_STYLE_LAYOUT_PARAMS[selectedCardStylePreset.id];
    const styleThemeSpec = CARD_PREVIEW_THEME_SPEC_MAP[selectedCardStylePreset.id];
    const modeId = selectedCardStyleModePreset?.id || '';
    const contentBackground = styleThemeSpec?.modeContentBackground?.[modeId]
      ?? styleThemeSpec?.contentBackground
      ?? styleLayout?.contentBackground;
    const backgroundStyle = contentBackground ? buildPreviewBackgroundStyle(contentBackground) : {};
    const paddingX = styleLayout?.contentPaddingX;
    const paddingY = styleLayout?.contentPaddingY;
    const paddingStyle = (typeof paddingX === 'number' && typeof paddingY === 'number')
      ? { padding: `${paddingY}rpx ${paddingX}rpx` }
      : {};
    return {
      ...backgroundStyle,
      ...paddingStyle,
    } as Record<string, string>;
  }, [cardWechatMode, selectedCardStyleModePreset, selectedCardStylePreset.id, selectedCardWechatStyle.backgroundColor]);

  const cardPreviewRichtextClass = useMemo(() => {
    const classes = ['preview-richtext'];
    if (cardWechatMode) {
      classes.push('preview-richtext--wechat');
      return classes.join(' ');
    }
    if (selectedCardStyle === 'apple-notes') {
      classes.push('preview-richtext--apple-notes');
    }
    return classes.join(' ');
  }, [cardWechatMode, selectedCardStyle]);

  const cardPreviewContentShellClass = useMemo(() => {
    if (cardWechatMode) {
      return 'preview-content-shell preview-content-shell--wechat';
    }
    return `preview-content-shell preview-content-shell--${selectedCardStylePreset.id}`;
  }, [cardWechatMode, selectedCardStylePreset.id]);

  const cardCoverPreviewTitle = useMemo(() => {
    const customTitle = cardCoverTitle.trim();
    if (customTitle) return customTitle;
    const firstHeading = cardMarkdown
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((line) => line.trim())
      .find((line) => /^#{1,6}\s+/.test(line));
    if (firstHeading) {
      return firstHeading.replace(/^#{1,6}\s+/, '').slice(0, 18) || '图文封面标题';
    }
    return '图文封面标题';
  }, [cardCoverTitle, cardMarkdown]);

  const cardCoverPreviewSubtitle = useMemo(() => {
    const customSubtitle = cardCoverSubtitle.trim();
    if (customSubtitle) return customSubtitle;
    return cardCoverMode === 'auto' ? '一键排版 · 自动封面' : '可配置封面副标题';
  }, [cardCoverMode, cardCoverSubtitle]);

  const cardCoverPreviewBackground = useMemo(() => {
    const style = CARD_COVER_STYLE_OPTIONS.find((item) => item.id === cardCoverStyleId) || CARD_COVER_STYLE_OPTIONS[0];
    return style?.preview || 'linear-gradient(135deg,#f7f0d5 0%,#e9d89a 100%)';
  }, [cardCoverStyleId]);

  const cardH1FontScaleIndex = useMemo(
    () => Math.max(0, CARD_FONT_SCALE_OPTIONS.findIndex((item) => item.id === cardH1FontScale)),
    [cardH1FontScale],
  );
  const cardH2FontScaleIndex = useMemo(
    () => Math.max(0, CARD_FONT_SCALE_OPTIONS.findIndex((item) => item.id === cardH2FontScale)),
    [cardH2FontScale],
  );
  const cardH3FontScaleIndex = useMemo(
    () => Math.max(0, CARD_FONT_SCALE_OPTIONS.findIndex((item) => item.id === cardH3FontScale)),
    [cardH3FontScale],
  );
  const cardBodyFontScaleIndex = useMemo(
    () => Math.max(0, CARD_FONT_SCALE_OPTIONS.findIndex((item) => item.id === cardBodyFontScale)),
    [cardBodyFontScale],
  );
  const cardFontFamilyIndex = useMemo(
    () => Math.max(0, CARD_FONT_FAMILY_OPTIONS.findIndex((item) => item.id === cardFontFamily)),
    [cardFontFamily],
  );
  const cardCoverFontFamilyIndex = useMemo(
    () => Math.max(0, CARD_FONT_FAMILY_OPTIONS.findIndex((item) => item.id === cardCoverFontFamily)),
    [cardCoverFontFamily],
  );
  const cardWechatArticleHtml = useMemo(() => {
    const source = cleanMyNoteCardText(cardMarkdown).trim() || '# 图文卡片\n\n请在编辑区输入内容。';
    return buildWechatArticleHtml(source, cardWechatPreviewStyle)
      .replace('background:#ffffff;', `background:${selectedCardWechatStyle.backgroundColor};`)
      .replace(`color:${cardWechatPreviewStyle.textColor};`, `color:${selectedCardWechatStyle.textColor};`);
  }, [cardMarkdown, cardWechatPreviewStyle, selectedCardWechatStyle]);

  const handleBack = () => {
    const pages = Taro.getCurrentPages();
    if (pages.length > 1) {
      Taro.navigateBack({ delta: 1 });
      return;
    }
    Taro.switchTab({ url: '/pages/home/index' });
  };

  const returnToHotRewrite = (payload?: {
    qrcode?: string;
    url?: string;
    images?: string[];
    kind?: 'infographic' | 'card-layout';
    status?: 'idle' | 'generating' | 'generated';
    generatedTaskId?: string;
  }) => {
    if (!hotRewriteReturnTaskId) {
      handleBack();
      return;
    }
    Taro.setStorageSync('HOT_REWRITE_RETURN_PAYLOAD', {
      taskId: hotRewriteReturnTaskId,
      mode: hotRewriteReturnMode,
      kind: payload?.kind || (activeFeature === 'infographic' ? 'infographic' : 'card-layout'),
      status: payload?.status || (activeFeature === 'infographic' ? 'generating' : 'generated'),
      generatedTaskId: payload?.generatedTaskId || '',
      images: Array.isArray(payload?.images) ? payload.images.filter(Boolean) : [],
      qrcode: payload?.qrcode || cardPublishQrcode || '',
      url: payload?.url || cardPublishUrl || '',
    });
    Taro.navigateTo({
      url: `/subpages/note-rewrite-result/index?taskId=${encodeURIComponent(hotRewriteReturnTaskId)}&mode=${encodeURIComponent(hotRewriteReturnMode)}`,
    });
  };

  const handleChooseImages = async () => {
    try {
      const result = await Taro.chooseImage({
        count: Math.max(1, maxAiReferenceImages - refImages.length),
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
      });
      const next = [...refImages, ...(result.tempFilePaths || [])].slice(0, maxAiReferenceImages);
      setRefImages(next);
    } catch {
      // canceled
    }
  };

  const handlePasteInfoContent = async () => {
    try {
      const clip = await Taro.getClipboardData();
      const text = (clip.data || '').trim();
      if (!text) {
        Taro.showToast({ title: '剪贴板为空', icon: 'none' });
        return;
      }
      setInfoContent((prev) => (prev ? `${prev}\n${text}` : text));
      Taro.showToast({ title: '已粘贴', icon: 'success' });
    } catch {
      Taro.showToast({ title: '粘贴失败', icon: 'none' });
    }
  };

  const handleFindInspiration = () => {
    Taro.setStorageSync('HOT_SQUARE_DEFAULT_FILTER', 'image');
    Taro.switchTab({ url: '/pages/hot-square/index' });
  };

  const handlePasteCardMarkdown = async () => {
    try {
      const clip = await Taro.getClipboardData();
      const text = (clip.data || '').trim();
      if (!text) {
        Taro.showToast({ title: '剪贴板为空', icon: 'none' });
        return;
      }
      setCardUserCleared(false);
      setCardMarkdown((prev) => (prev ? `${prev}\n${text}` : text));
      Taro.showToast({ title: '已粘贴', icon: 'success' });
    } catch {
      Taro.showToast({ title: '粘贴失败', icon: 'none' });
    }
  };

  const handleOptimizeCardMarkdown = async () => {
    if (cardOptimizing) return;
    const source = cardMarkdown.trim();
    if (!source) {
      Taro.showToast({ title: '请先输入文案', icon: 'none' });
      return;
    }
    setCardOptimizing(true);
    try {
      const normalized = await miniappApi.normalizeXhsMarkdown(source);
      const nextMarkdown = (normalized.standardizedMarkdown || normalized.markdown || source).trim();
      if (!nextMarkdown) {
        Taro.showToast({ title: '优化结果为空，请重试', icon: 'none' });
        return;
      }
      setCardUserCleared(false);
      setCardMarkdown(nextMarkdown);
      setCardPreviewImages([]);
      Taro.showToast({ title: '已优化排版，原文不变', icon: 'success' });
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '优化失败，请稍后重试',
        icon: 'none',
      });
    } finally {
      setCardOptimizing(false);
    }
  };

  const handleCopyWechatArticle = async () => {
    const source = cleanMyNoteCardText(cardMarkdown).trim();
    if (!source) {
      Taro.showToast({ title: '请先输入内容', icon: 'none' });
      return;
    }
    try {
      await Taro.setClipboardData({
        data: cardWechatArticleHtml,
      });
      Taro.showModal({
        title: '已复制公众号稿',
        content: '小程序剪贴板会复制 HTML 源码；在电脑端公众号后台可作为草稿源码使用。若只需要纯文字，可直接复制编辑区内容。',
        showCancel: false,
        confirmText: '知道了',
      });
    } catch {
      Taro.showToast({ title: '复制失败，请重试', icon: 'none' });
    }
  };

  const handleCreateAiImage = async () => {
    if (!aiPrompt.trim()) {
      Taro.showToast({ title: '请先填写图片描述', icon: 'none' });
      return;
    }
    if (aiSubmitLockedRef.current || aiSubmitting) return;

    aiSubmitLockedRef.current = true;
    setAiSubmitting(true);
    try {
      const remoteImages = refImages.filter((item) => /^https?:\/\//i.test(item));
      const localImages = refImages.filter((item) => !/^https?:\/\//i.test(item));

      const uploadedLocalImages = await Promise.all(
        localImages.slice(0, maxAiReferenceImages).map((path, idx) =>
          api.uploadMedia(path, `image2-ref-${Date.now()}-${idx + 1}.jpg`, 'image/jpeg'),
        ),
      );
      const imagePayload = [...remoteImages, ...uploadedLocalImages].slice(0, maxAiReferenceImages);
      const aspectOption = getImageAspectOption(selectedImageAspect);

      const result = await miniappApi.startCanvasImageJob({
        prompt: aiPrompt.trim(),
        model: selectedModel,
        size: aspectOption.size,
        aspectRatio: aspectOption.key,
        n: 1,
        image: imagePayload,
      });

      Taro.setStorageSync('IMAGE_GEN_LAST_TASK_ID', result.taskId);
      try {
        const modalResult = await Taro.showModal({
          title: '图片生产中',
          content: returnTarget === 'action-transfer'
            ? '图片生产中，完成后在作品详情点“用于动作复刻”即可带回。'
            : '图片生产中，请在作品中查看生成结果',
          cancelText: '继续',
          confirmText: '作品',
        });
        if (modalResult.confirm) {
          if (returnTarget === 'action-transfer') {
            Taro.setStorageSync(WORK_SELECT_TARGET_STORAGE_KEY, {
              target: 'action-transfer',
              storageKey: ACTION_TRANSFER_IMAGE_RETURN_KEY,
              backUrl: '/subpages/remix-generate/index?mode=action-transfer',
            });
          }
          await Taro.switchTab({ url: '/pages/works/index' });
        }
      } catch {
        Taro.showToast({ title: '任务已提交，请到作品查看', icon: 'none' });
      }
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : 'AI作图失败',
        icon: 'none',
      });
    } finally {
      aiSubmitLockedRef.current = false;
      setAiSubmitting(false);
    }
  };

  const handleCreateInfographic = async () => {
    if (!infoContent.trim()) {
      Taro.showToast({ title: '请先填写信息图内容', icon: 'none' });
      return;
    }
    if (infoSubmitting) return;

    setInfoSubmitting(true);
    try {
      const pickedTemplate = selectedInfographicTemplate;
      if (!pickedTemplate) {
        throw new Error('暂无模板，请先在网页端创建风格模板');
      }
      if (pickedTemplate.status === 'FAILED') {
        throw new Error('当前模板不可用，请切换其他模板');
      }

      const styleProfileJson = extractInfographicStyleProfile(pickedTemplate);
      if (!styleProfileJson) {
        throw new Error('当前模板缺少风格配置，请切换其他模板');
      }

      const generated = await miniappApi.startXhsText2ImageTask({
        title: pickedTemplate.title || '信息图',
        text: infoContent.trim(),
        styleId: pickedTemplate.id,
        styleProfileJson,
        imageCount: infographicCount,
        language: '简体',
      });

      Taro.setStorageSync('INFOGRAPHIC_LAST_TASK_ID', generated.taskId);
      if (hotRewriteReturnTaskId) {
        returnToHotRewrite({
          kind: 'infographic',
          status: 'generating',
          generatedTaskId: generated.taskId,
          images: [],
        });
        return;
      }

      const modalResult = await Taro.showModal({
        title: '信息图任务已提交',
        content: '任务会在后台生成，请在作品页查看生成结果。',
        cancelText: '继续创作',
        confirmText: '去作品',
      });
      if (modalResult.confirm) {
        await Taro.switchTab({ url: '/pages/works/index' });
      }
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '信息图生成失败',
        icon: 'none',
      });
    } finally {
      setInfoSubmitting(false);
    }
  };

  const handleCreateCard = async () => {
    const cleanCardMarkdown = cleanMyNoteCardText(cardMarkdown);
    if (!cleanCardMarkdown.trim()) {
      Taro.showToast({ title: '请先粘贴或输入内容', icon: 'none' });
      return;
    }
    if (cardSubmitting) return;

    setCardSubmitting(true);
    try {
      const normalized = await miniappApi.normalizeXhsMarkdown(cleanCardMarkdown.trim());
      const normalizedMarkdown = normalized.standardizedMarkdown || normalized.markdown || cleanCardMarkdown.trim();
      const meta = await miniappApi.generateXhsMeta(normalizedMarkdown, 'miniapp-card.md');

      const tagsText = Array.isArray(meta.tags) && meta.tags.length > 0
        ? meta.tags.map((tag) => `#${tag}`).join(' ')
        : '';
      const output = [
        meta.title ? `# ${meta.title}` : '# 图文卡片',
        '',
        meta.body || '',
        '',
        tagsText,
      ].join('\n').trim();

      const densifyMarkdown = (source: string): string => {
        if (cardDensity === 'balanced') return source;
        const lines = source
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);
        if (cardDensity === 'compact') {
          return lines.join('\n');
        }
        return lines.join('\n\n');
      };

      const renderMarkdown = densifyMarkdown(normalizedMarkdown);
      const withCoverFrontmatter = (() => {
        if (!cardIncludeCover) return renderMarkdown;
        const coverTitle = (cardCoverTitle || '').trim();
        const coverSubtitle = (cardCoverSubtitle || '').trim();
        if (cardCoverMode === 'auto' || (!coverTitle && !coverSubtitle)) return renderMarkdown;

        const escapeFm = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const frontmatterLines: string[] = [
          '---',
          `cover_title: "${escapeFm(coverTitle || (meta.title || '图文卡片'))}"`,
        ];
        if (coverSubtitle) {
          frontmatterLines.push(`subtitle: "${escapeFm(coverSubtitle)}"`);
        }
        frontmatterLines.push('---', '');
        return `${frontmatterLines.join('\n')}${renderMarkdown}`;
      })();

      const paletteMapping: Record<CardThemeColor, string> = {
        amber: 'warm',
        blue: 'ocean',
        green: 'forest',
        rose: 'rose',
      };

      const coverStyleTemplateMapping: Record<CardCoverStyleId, LegacyCardTemplateId> = {
        'image-focus': 'cinematic-film',
        'grid-paper': 'notion-style',
        'rounded-gray-note': 'polaroid',
        'pastel-purple-cat': 'aura-gradient',
        'warm-gray-dog': 'minimalist-magazine',
        'lined-notebook': 'pro-doc',
        'lime-question': 'ios-memo',
        'mint-splash': 'starry-night',
      };
      const styleKey = `${selectedCardStylePreset.renderTone}-${paletteMapping[cardThemeColor]}`;
      const selectedLegacyTemplateId = selectedCardStylePreset.backendTemplateId;
      const templateId = cardIncludeCover
        ? coverStyleTemplateMapping[cardCoverStyleId]
        : selectedLegacyTemplateId;

      const cardStyleConfig = {
        style: selectedCardStyle,
        styleMode: selectedCardStyleMode || '',
        styleKey,
        templateId,
        color: cardThemeColor,
        radius: cardRadius,
        headingSpacing: cardHeadingSpacing,
        fontFamily: cardFontFamily,
        h1FontScale: cardH1FontScale,
        h2FontScale: cardH2FontScale,
        h3FontScale: cardH3FontScale,
        bodyFontScale: cardBodyFontScale,
        density: cardDensity,
        includeCover: cardIncludeCover,
        coverMode: cardCoverMode,
        coverStyleId: cardCoverStyleId,
        coverImage: cardCoverImage,
        coverTitle: cardCoverTitle,
        coverSubtitle: cardCoverSubtitle,
        coverTextColor: cardCoverTextColor,
        coverHighlightColor: cardCoverHighlightColor,
        coverCardRadius: cardCoverCardRadius,
        coverShowStickers: cardCoverShowStickers,
        coverFontFamily: CARD_FONT_FAMILY_STACK_MAP[cardCoverFontFamily] || CARD_FONT_FAMILY_STACK_MAP.system,
        coverTitleAlignX: cardCoverTitleAlignX,
        coverTitleAlignY: cardCoverTitleAlignY,
        coverFontSize: cardCoverFontSize,
        coverSubtitleFontSize: cardCoverSubtitleFontSize,
        coverLineHeight: cardCoverLineHeight,
        maxPages: cardMaxPages,
      };

      const renderResult = await miniappApi.renderXhsLayout({
        markdown: withCoverFrontmatter,
        styleKey,
        templateId,
        title: meta.title || '图文卡片',
        includeCover: cardIncludeCover,
        maxPages: cardMaxPages,
        persist: true,
        requirePreview: true,
        preview: {
          pages: cardPreviewPages,
          cardClassName: `preview-card ${cardPreviewThemeClass}`,
          cardStyle: cardPreviewThemeInlineStyle,
          contentClassName: cardPreviewContentShellClass,
          contentStyle: cardPreviewContentInlineStyle,
          richTextClassName: cardPreviewRichtextClass,
          selectedCardStyle,
        },
        cover: {
          coverStyleId: cardCoverStyleId,
          coverImage: cardCoverImage,
          coverTitle: cardCoverTitle,
          coverSubtitle: cardCoverSubtitle,
          coverTextColor: cardCoverTextColor,
          coverHighlightColor: cardCoverHighlightColor,
          coverCardRadius: cardCoverCardRadius,
          coverShowStickers: cardCoverShowStickers,
          coverFontFamily: CARD_FONT_FAMILY_STACK_MAP[cardCoverFontFamily] || CARD_FONT_FAMILY_STACK_MAP.system,
          coverTitleAlignX: cardCoverTitleAlignX,
          coverTitleAlignY: cardCoverTitleAlignY,
          coverFontSize: cardCoverFontSize,
          coverSubtitleFontSize: cardCoverSubtitleFontSize,
          coverLineHeight: cardCoverLineHeight,
        },
      });
      const publishImages = Array.isArray(renderResult.images)
        ? renderResult.images.filter(Boolean)
        : [];
      if (publishImages.length === 0) {
        throw new Error('模板渲染失败，请稍后重试');
      }

      const published = await miniappApi.publishXhsLayout({
        title: meta.title || '图文卡片',
        content: output,
        images: publishImages,
        taskId: renderResult.taskId || '',
      });

      setCardUserCleared(false);
      setCardMarkdown(renderMarkdown);
      setCardPreviewImages(publishImages);
      setCardPublishQrcode(published.qrcode || '');
      setCardPublishUrl(published.url || '');
      Taro.setStorageSync('CARD_LAYOUT_PREVIEW_MD', renderMarkdown);
      Taro.setStorageSync('CARD_LAYOUT_PUBLISH_TEXT', output);
      Taro.setStorageSync('CARD_LAYOUT_PUBLISH_QRCODE', published.qrcode || '');
      Taro.setStorageSync('CARD_LAYOUT_PREVIEW_IMAGES', publishImages);
      Taro.setStorageSync('CARD_LAYOUT_LAST_TASK_ID', renderResult.taskId || '');
      Taro.setStorageSync('CARD_LAYOUT_STYLE_CONFIG', cardStyleConfig);

      if (hotRewriteReturnTaskId) {
        returnToHotRewrite({
          kind: 'card-layout',
          status: 'generated',
          generatedTaskId: renderResult.taskId || '',
          images: publishImages,
          qrcode: published.qrcode || '',
          url: published.url || '',
        });
        return;
      }

      if (published.qrcode) {
        Taro.showToast({ title: '二维码已生成', icon: 'success' });
      } else {
        Taro.showToast({ title: '卡片已生成并发布', icon: 'success' });
      }

      if (renderResult.taskId && !hotRewriteReturnTaskId) {
        setTimeout(() => {
          Taro.switchTab({ url: '/pages/works/index' });
        }, 600);
      }
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '图文卡片处理失败',
        icon: 'none',
      });
    } finally {
      setCardSubmitting(false);
    }
  };

  const buildCardRenderPayload = () => {
    const sourceMarkdown = cleanMyNoteCardText(cardMarkdown).trim();
    const densifyMarkdown = (source: string): string => {
      if (cardDensity === 'balanced') return source;
      const lines = source
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      if (cardDensity === 'compact') return lines.join('\n');
      return lines.join('\n\n');
    };

    const renderMarkdown = densifyMarkdown(sourceMarkdown);
    const renderTitle = (() => {
      const custom = cardCoverTitle.trim();
      if (custom) return custom.slice(0, 28);
      const firstHeading = renderMarkdown
        .split('\n')
        .map((line) => line.trim())
        .find((line) => /^#{1,6}\s+/.test(line));
      if (firstHeading) return firstHeading.replace(/^#{1,6}\s+/, '').trim().slice(0, 28);
      return '图文卡片';
    })();

    const withCoverFrontmatter = (() => {
      if (!cardIncludeCover) return renderMarkdown;
      const coverTitle = (cardCoverTitle || '').trim();
      const coverSubtitle = (cardCoverSubtitle || '').trim();
      if (cardCoverMode === 'auto' || (!coverTitle && !coverSubtitle)) return renderMarkdown;

      const escapeFm = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const frontmatterLines: string[] = [
        '---',
        `cover_title: "${escapeFm(coverTitle || renderTitle)}"`,
      ];
      if (coverSubtitle) {
        frontmatterLines.push(`subtitle: "${escapeFm(coverSubtitle)}"`);
      }
      frontmatterLines.push('---', '');
      return `${frontmatterLines.join('\n')}${renderMarkdown}`;
    })();

    const paletteMapping: Record<CardThemeColor, string> = {
      amber: 'warm',
      blue: 'ocean',
      green: 'forest',
      rose: 'rose',
    };

    const coverStyleTemplateMapping: Record<CardCoverStyleId, LegacyCardTemplateId> = {
      'image-focus': 'cinematic-film',
      'grid-paper': 'notion-style',
      'rounded-gray-note': 'polaroid',
      'pastel-purple-cat': 'aura-gradient',
      'warm-gray-dog': 'minimalist-magazine',
      'lined-notebook': 'pro-doc',
      'lime-question': 'ios-memo',
      'mint-splash': 'starry-night',
    };
    const styleKey = `${selectedCardStylePreset.renderTone}-${paletteMapping[cardThemeColor]}`;
    const selectedLegacyTemplateId = selectedCardStylePreset.backendTemplateId;
    const templateId = cardIncludeCover
      ? coverStyleTemplateMapping[cardCoverStyleId]
      : selectedLegacyTemplateId;

    return {
      renderTitle,
      renderMarkdown,
      withCoverFrontmatter,
      styleKey,
      templateId,
    };
  };

  const renderCardImagesForPreview = async () => {
    const renderPayload = buildCardRenderPayload();
    const renderResult = await miniappApi.renderXhsLayout({
      markdown: renderPayload.withCoverFrontmatter,
      styleKey: renderPayload.styleKey,
      templateId: renderPayload.templateId,
      title: renderPayload.renderTitle || '图文卡片',
      includeCover: cardIncludeCover,
      maxPages: cardMaxPages,
      persist: false,
      requirePreview: true,
      preview: {
        pages: cardPreviewPages,
        cardClassName: `preview-card ${cardPreviewThemeClass}`,
        cardStyle: cardPreviewThemeInlineStyle,
        contentClassName: cardPreviewContentShellClass,
        contentStyle: cardPreviewContentInlineStyle,
        richTextClassName: cardPreviewRichtextClass,
        selectedCardStyle,
      },
      cover: {
        coverStyleId: cardCoverStyleId,
        coverImage: cardCoverImage,
        coverTitle: cardCoverTitle,
        coverSubtitle: cardCoverSubtitle,
        coverTextColor: cardCoverTextColor,
        coverHighlightColor: cardCoverHighlightColor,
        coverCardRadius: cardCoverCardRadius,
        coverShowStickers: cardCoverShowStickers,
        coverFontFamily: CARD_FONT_FAMILY_STACK_MAP[cardCoverFontFamily] || CARD_FONT_FAMILY_STACK_MAP.system,
        coverTitleAlignX: cardCoverTitleAlignX,
        coverTitleAlignY: cardCoverTitleAlignY,
        coverFontSize: cardCoverFontSize,
        coverSubtitleFontSize: cardCoverSubtitleFontSize,
        coverLineHeight: cardCoverLineHeight,
      },
    });
    const images = Array.isArray(renderResult.images) ? renderResult.images.filter(Boolean) : [];
    if (images.length === 0) throw new Error('生成预览图失败');
    return images;
  };

  const ensureAlbumPermission = async (): Promise<boolean> => {
    try {
      const setting = await Taro.getSetting();
      if (setting.authSetting['scope.writePhotosAlbum']) return true;
      try {
        await Taro.authorize({ scope: 'scope.writePhotosAlbum' });
        return true;
      } catch {
        const confirm = await Taro.showModal({
          title: '需要相册权限',
          content: '导出图片需要保存到系统相册，请先授权。',
          confirmText: '去设置',
          cancelText: '取消',
        });
        if (!confirm.confirm) return false;
        const open = await Taro.openSetting();
        return !!open.authSetting['scope.writePhotosAlbum'];
      }
    } catch {
      return false;
    }
  };

  const handleExportCardImages = async () => {
    if (cardExporting) return;

    if (cardWechatMode) {
      await handleCopyWechatArticle();
      return;
    }

    if (!cardMarkdown.trim()) {
      Taro.showToast({ title: '请先输入内容', icon: 'none' });
      return;
    }

    let exportImages: string[] = [];

    try {
      setCardExporting(true);
      Taro.showLoading({ title: '正在准备导出图', mask: true });
      exportImages = await renderCardImagesForPreview();
      Taro.setStorageSync('CARD_LAYOUT_PREVIEW_IMAGES', exportImages);
      setCardPreviewImages(exportImages);
      setCardPreviewPageIndex(0);
      if (exportImages.length === 0) {
        Taro.showToast({ title: '生成导出图失败', icon: 'none' });
        setCardExporting(false);
        return;
      }
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '生成导出图失败',
        icon: 'none',
      });
      setCardExporting(false);
      return;
    } finally {
      Taro.hideLoading();
    }

    const hasPermission = await ensureAlbumPermission();
    if (!hasPermission) {
      Taro.showToast({ title: '未获得相册权限', icon: 'none' });
      setCardExporting(false);
      return;
    }

    let successCount = 0;
    let failCount = 0;

    try {
      const total = exportImages.length;
      for (let index = 0; index < exportImages.length; index += 1) {
        const imageUrl = exportImages[index];
        Taro.showLoading({
          title: `导出中 ${index + 1}/${total}`,
          mask: true,
        });
        try {
          let filePath = '';
          if (/^https?:\/\//i.test(imageUrl)) {
            const download = await Taro.downloadFile({
              url: buildCardExportDownloadUrl(imageUrl, index),
              header: buildCardExportDownloadHeaders(),
            });
            if (download.statusCode !== 200 || !download.tempFilePath) {
              throw new Error('download_failed');
            }
            filePath = download.tempFilePath;
          } else {
            filePath = imageUrl;
          }
          await Taro.saveImageToPhotosAlbum({ filePath });
          successCount += 1;
        } catch (error) {
          try {
            await Taro.request({
              url: `${getApiBaseUrl()}/api/client-logs`,
              method: 'POST',
              data: {
                event: 'miniapp_xhs_card_export_image_failed',
                payload: {
                  imageUrl,
                  downloadUrl: /^https?:\/\//i.test(imageUrl) ? buildCardExportDownloadUrl(imageUrl, index) : imageUrl,
                  error: error instanceof Error ? error.message : String(error || 'unknown'),
                },
                client: 'weapp',
                createdAt: new Date().toISOString(),
              },
              timeout: 5000,
            });
          } catch {
            // ignore diagnostics failure
          }
          failCount += 1;
        }
      }

      if (successCount > 0 && failCount === 0) {
        await Taro.showModal({
          title: '导出完成',
          content: `成功导出 ${successCount} 张图片到系统相册。`,
          showCancel: Boolean(hotRewriteReturnTaskId),
          cancelText: '留在本页',
          confirmText: hotRewriteReturnTaskId ? '返回仿写结果' : '知道了',
          success: (res) => {
            if (res.confirm && hotRewriteReturnTaskId) {
              returnToHotRewrite({
                kind: 'card-layout',
                status: 'generated',
                images: exportImages,
              });
            }
          },
        });
      } else if (successCount > 0) {
        await Taro.showModal({
          title: '部分导出成功',
          content: `成功 ${successCount} 张，失败 ${failCount} 张。可重试导出。`,
          showCancel: Boolean(hotRewriteReturnTaskId),
          cancelText: '留在本页',
          confirmText: hotRewriteReturnTaskId ? '返回仿写结果' : '知道了',
          success: (res) => {
            if (res.confirm && hotRewriteReturnTaskId) {
              returnToHotRewrite({
                kind: 'card-layout',
                status: 'generated',
                images: exportImages,
              });
            }
          },
        });
      } else {
        await Taro.showModal({
          title: '导出失败',
          content: '没有图片导出成功，请稍后重试。',
          showCancel: false,
          confirmText: '知道了',
        });
      }
    } finally {
      Taro.hideLoading();
      setCardExporting(false);
    }
  };

  const handleAddTemplate = () => {
    Taro.showToast({ title: '模板管理即将上线', icon: 'none' });
  };

  const renderSectionTitle = (icon: string, title: string, extra?: ReactNode) => (
    <View className='section-title-row'>
      <View className={`section-title-icon section-title-icon--${icon}`} />
      <Text className='section-title'>{title}</Text>
      {extra ? <View className='section-title-extra'>{extra}</View> : null}
    </View>
  );

  const renderCardSettingsPanel = () => {
    const wechatModeRows = (
      <>
        <View className='card-config-row'>
          <View className='card-config-label-group'>
            <Text className='card-config-label'>公众号模式</Text>
            <Text className='card-config-desc'>切换为公众号正文宽度，导出改为复制 HTML 草稿。</Text>
          </View>
          <View
            className={`card-switch ${cardWechatMode ? 'card-switch--active' : ''}`}
            onClick={() => {
              setCardWechatMode((prev) => !prev);
              setCardPreviewImages([]);
              setCardPreviewPageIndex(0);
            }}
          >
            <View className='card-switch-dot' />
          </View>
        </View>
        {cardWechatMode && (
          <>
            <View className='card-config-row card-config-row--wechat-style'>
              <Text className='card-config-label'>公众号风格</Text>
              <View className='wechat-style-grid'>
                {CARD_WECHAT_STYLE_OPTIONS.map((item) => {
                  const active = cardWechatStyleId === item.id;
                  return (
                    <View
                      key={item.id}
                      className={`wechat-style-card ${active ? 'wechat-style-card--active' : ''}`}
                      onClick={() => setCardWechatStyleId(item.id)}
                    >
                      <View className='wechat-style-preview' style={{ backgroundColor: item.backgroundColor, borderColor: item.borderColor }}>
                        <View className='wechat-style-preview-line' style={{ backgroundColor: item.accentColor }} />
                        <View className='wechat-style-preview-text' style={{ backgroundColor: item.textColor }} />
                        <View className='wechat-style-preview-text wechat-style-preview-text--short' style={{ backgroundColor: item.accentColor }} />
                      </View>
                      <Text className={`wechat-style-title ${active ? 'wechat-style-title--active' : ''}`}>{item.title}</Text>
                      <Text className={`wechat-style-desc ${active ? 'wechat-style-desc--active' : ''}`}>{item.desc}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
            <View className='card-config-row'>
              <Text className='card-config-label'>正文字体</Text>
              <Picker
                mode='selector'
                range={CARD_FONT_FAMILY_OPTIONS.map((item) => item.title)}
                value={cardFontFamilyIndex}
                onChange={(event) => {
                  const idx = Number(event.detail.value);
                  const picked = CARD_FONT_FAMILY_OPTIONS[idx];
                  if (picked) setCardFontFamily(picked.id);
                }}
              >
                <View className='picker-chip'>
                  <Text className='picker-chip-text'>{CARD_FONT_FAMILY_OPTIONS[cardFontFamilyIndex]?.title || '系统无衬线'}</Text>
                </View>
              </Picker>
            </View>
          </>
        )}
      </>
    );

    if (cardWechatMode) {
      return (
        <View className='card-settings-content'>
          {renderSectionTitle('style', '公众号配置')}
          <View className='card-config-card'>
            {wechatModeRows}
          </View>
        </View>
      );
    }

    return (
      <View className='card-settings-content'>
      {renderSectionTitle('style', '样式配置')}
      <View className='card-config-card'>
        {wechatModeRows}
        <View className='card-config-row'>
          <Text className='card-config-label'>封面页</Text>
          <View
            className={`card-switch ${cardIncludeCover ? 'card-switch--active' : ''}`}
            onClick={() => setCardIncludeCover((prev) => !prev)}
          >
            <View className='card-switch-dot' />
          </View>
        </View>
        {cardIncludeCover && (
          <View className='card-cover-config'>
            <View className='card-config-row card-config-row--no-divider'>
              <Text className='card-config-label'>封面风格</Text>
              <ScrollView scrollX className='cover-style-scroll'>
                <View className='cover-style-track'>
                  {CARD_COVER_STYLE_OPTIONS.map((item) => (
                    <View
                      key={item.id}
                      className={`cover-style-card cover-style-card--h ${cardCoverStyleId === item.id ? 'cover-style-card--active' : ''}`}
                      onClick={() => applyCardCoverStyleDefaults(item.id)}
                    >
                      <View className={`cover-style-preview cover-style-preview--${item.id}`}>
                        <View className='cover-style-preview-overlay'>
                          <Text className='cover-style-preview-title'>{cardCoverPreviewTitle}</Text>
                          <Text className='cover-style-preview-subtitle'>{cardCoverPreviewSubtitle}</Text>
                        </View>
                      </View>
                      <View className='cover-style-meta'>
                        <Text className={`cover-style-title ${cardCoverStyleId === item.id ? 'cover-style-title--active' : ''}`}>{item.title}</Text>
                        <Text className={`cover-style-desc ${cardCoverStyleId === item.id ? 'cover-style-desc--active' : ''}`}>{item.desc}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
            <View className='card-config-row card-config-row--no-divider'>
              <Text className='card-config-label'>封面文案模式</Text>
              <View className='card-config-chips'>
                {CARD_COVER_MODE_OPTIONS.map((item) => (
                  <View
                    key={item.id}
                    className={`tiny-chip ${cardCoverMode === item.id ? 'tiny-chip--active' : ''}`}
                    onClick={() => setCardCoverMode(item.id)}
                  >
                    <Text className={`tiny-chip-text ${cardCoverMode === item.id ? 'tiny-chip-text--active' : ''}`}>{item.title}</Text>
                  </View>
                ))}
              </View>
            </View>
            <View className='card-cover-inputs'>
              <Input
                className='card-cover-input'
                value={cardCoverTitle}
                onInput={(event) => setCardCoverTitle(event.detail.value)}
                placeholder='封面标题（留空默认取文章标题）'
                maxlength={30}
              />
              <Input
                className='card-cover-input'
                value={cardCoverSubtitle}
                onInput={(event) => setCardCoverSubtitle(event.detail.value)}
                placeholder='封面副标题（可选）'
                maxlength={40}
              />
              <Input
                className='card-cover-input'
                value={cardCoverImage}
                onInput={(event) => setCardCoverImage(event.detail.value)}
                placeholder='封面图 URL（可选）'
                maxlength={600}
              />
            </View>
            <View className='card-config-row'>
              <Text className='card-config-label'>封面文字色</Text>
              <View className='card-config-chips'>
                {TEXT_COLOR_PRESETS.slice(0, 8).map((color) => (
                  <View
                    key={color}
                    className={`tiny-chip ${cardCoverTextColor === color ? 'tiny-chip--active' : ''}`}
                    onClick={() => setCardCoverTextColor(color)}
                  >
                    <Text className={`tiny-chip-text ${cardCoverTextColor === color ? 'tiny-chip-text--active' : ''}`}>{color}</Text>
                  </View>
                ))}
              </View>
            </View>
            <View className='card-config-row'>
              <Text className='card-config-label'>高亮笔刷色</Text>
              <View className='card-config-chips'>
                {ACCENT_COLOR_PRESETS.slice(0, 8).map((color) => (
                  <View
                    key={color}
                    className={`tiny-chip ${cardCoverHighlightColor === color ? 'tiny-chip--active' : ''}`}
                    onClick={() => setCardCoverHighlightColor(color)}
                  >
                    <Text className={`tiny-chip-text ${cardCoverHighlightColor === color ? 'tiny-chip-text--active' : ''}`}>{color}</Text>
                  </View>
                ))}
              </View>
            </View>
            <View className='card-config-row'>
              <Text className='card-config-label'>封面圆角</Text>
              <View className='card-config-chips'>
                {[0, 24, 36, 42, 46, 56, 64].map((radius) => (
                  <View
                    key={radius}
                    className={`tiny-chip ${cardCoverCardRadius === radius ? 'tiny-chip--active' : ''}`}
                    onClick={() => setCardCoverCardRadius(radius)}
                  >
                    <Text className={`tiny-chip-text ${cardCoverCardRadius === radius ? 'tiny-chip-text--active' : ''}`}>{radius}px</Text>
                  </View>
                ))}
              </View>
            </View>
            <View className='card-config-row'>
              <Text className='card-config-label'>封面贴纸</Text>
              <View
                className={`card-switch ${cardCoverShowStickers ? 'card-switch--active' : ''}`}
                onClick={() => setCardCoverShowStickers((prev) => !prev)}
              >
                <View className='card-switch-dot' />
              </View>
            </View>
            <View className='card-config-row'>
              <Text className='card-config-label'>封面字体</Text>
              <Picker
                mode='selector'
                range={CARD_FONT_FAMILY_OPTIONS.map((item) => item.title)}
                value={cardCoverFontFamilyIndex}
                onChange={(event) => {
                  const idx = Number(event.detail.value);
                  const picked = CARD_FONT_FAMILY_OPTIONS[idx];
                  if (picked) setCardCoverFontFamily(picked.id);
                }}
              >
                <View className='picker-chip'>
                  <Text className='picker-chip-text'>{CARD_FONT_FAMILY_OPTIONS[cardCoverFontFamilyIndex]?.title || '系统无衬线'}</Text>
                </View>
              </Picker>
            </View>
            <View className='card-config-row'>
              <Text className='card-config-label'>标题对齐</Text>
              <View className='card-config-chips'>
                {CARD_COVER_TITLE_ALIGN_X_OPTIONS.map((item) => (
                  <View
                    key={item.id}
                    className={`tiny-chip ${cardCoverTitleAlignX === item.id ? 'tiny-chip--active' : ''}`}
                    onClick={() => setCardCoverTitleAlignX(item.id)}
                  >
                    <Text className={`tiny-chip-text ${cardCoverTitleAlignX === item.id ? 'tiny-chip-text--active' : ''}`}>{item.title}</Text>
                  </View>
                ))}
              </View>
            </View>
            <View className='card-config-row'>
              <Text className='card-config-label'>垂直位置</Text>
              <View className='card-config-chips'>
                {CARD_COVER_TITLE_ALIGN_Y_OPTIONS.map((item) => (
                  <View
                    key={item.id}
                    className={`tiny-chip ${cardCoverTitleAlignY === item.id ? 'tiny-chip--active' : ''}`}
                    onClick={() => setCardCoverTitleAlignY(item.id)}
                  >
                    <Text className={`tiny-chip-text ${cardCoverTitleAlignY === item.id ? 'tiny-chip-text--active' : ''}`}>{item.title}</Text>
                  </View>
                ))}
              </View>
            </View>
            <View className='card-config-row'>
              <Text className='card-config-label'>标题字号</Text>
              <View className='card-config-chips'>
                {[92, 120, 150, 180, 195, 210, 220].map((size) => (
                  <View
                    key={size}
                    className={`tiny-chip ${Math.round(cardCoverFontSize) === size ? 'tiny-chip--active' : ''}`}
                    onClick={() => setCardCoverFontSize(size)}
                  >
                    <Text className={`tiny-chip-text ${Math.round(cardCoverFontSize) === size ? 'tiny-chip-text--active' : ''}`}>{size}</Text>
                  </View>
                ))}
              </View>
            </View>
            <View className='card-config-row'>
              <Text className='card-config-label'>副标题字号</Text>
              <View className='card-config-chips'>
                {[46, 64, 80, 96, 120, 150, 180].map((size) => (
                  <View
                    key={size}
                    className={`tiny-chip ${Math.round(cardCoverSubtitleFontSize) === size ? 'tiny-chip--active' : ''}`}
                    onClick={() => setCardCoverSubtitleFontSize(size)}
                  >
                    <Text className={`tiny-chip-text ${Math.round(cardCoverSubtitleFontSize) === size ? 'tiny-chip-text--active' : ''}`}>{size}</Text>
                  </View>
                ))}
              </View>
            </View>
            <View className='card-config-row'>
              <Text className='card-config-label'>封面行高</Text>
              <View className='card-config-chips'>
                {[1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2.0].map((value) => (
                  <View
                    key={value}
                    className={`tiny-chip ${cardCoverLineHeight === value ? 'tiny-chip--active' : ''}`}
                    onClick={() => setCardCoverLineHeight(clampNumber(value, COVER_LINE_HEIGHT_MIN, COVER_LINE_HEIGHT_MAX))}
                  >
                    <Text className={`tiny-chip-text ${cardCoverLineHeight === value ? 'tiny-chip-text--active' : ''}`}>{value.toFixed(1)}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}
        <View className='card-config-row'>
          <Text className='card-config-label'>最大页数</Text>
          <View className='card-config-chips'>
            {CARD_MAX_PAGE_OPTIONS.map((value) => (
              <View
                key={`max-page-${value}`}
                className={`tiny-chip ${cardMaxPages === value ? 'tiny-chip--active' : ''}`}
                onClick={() => setCardMaxPages(value)}
              >
                <Text className={`tiny-chip-text ${cardMaxPages === value ? 'tiny-chip-text--active' : ''}`}>{value}</Text>
              </View>
            ))}
          </View>
        </View>
        <View className='card-config-row'>
          <Text className='card-config-label'>排版密度</Text>
          <View className='card-config-chips'>
            {CARD_DENSITY_OPTIONS.map((item) => (
              <View
                key={item.id}
                className={`tiny-chip ${cardDensity === item.id ? 'tiny-chip--active' : ''}`}
                onClick={() => setCardDensity(item.id)}
              >
                <Text className={`tiny-chip-text ${cardDensity === item.id ? 'tiny-chip-text--active' : ''}`}>{item.title}</Text>
              </View>
            ))}
          </View>
        </View>
        <View className='card-config-row'>
          <Text className='card-config-label'>一级标题</Text>
          <Picker
            mode='selector'
            range={CARD_FONT_SCALE_OPTIONS.map((item) => item.title)}
            value={cardH1FontScaleIndex}
            onChange={(event) => {
              const idx = Number(event.detail.value);
              const picked = CARD_FONT_SCALE_OPTIONS[idx];
              if (picked) setCardH1FontScale(picked.id);
            }}
          >
            <View className='picker-chip'>
              <Text className='picker-chip-text'>{CARD_FONT_SCALE_OPTIONS[cardH1FontScaleIndex]?.title || '16'}</Text>
            </View>
          </Picker>
        </View>
        <View className='card-config-row'>
          <Text className='card-config-label'>二级标题</Text>
          <Picker
            mode='selector'
            range={CARD_FONT_SCALE_OPTIONS.map((item) => item.title)}
            value={cardH2FontScaleIndex}
            onChange={(event) => {
              const idx = Number(event.detail.value);
              const picked = CARD_FONT_SCALE_OPTIONS[idx];
              if (picked) setCardH2FontScale(picked.id);
            }}
          >
            <View className='picker-chip'>
              <Text className='picker-chip-text'>{CARD_FONT_SCALE_OPTIONS[cardH2FontScaleIndex]?.title || '16'}</Text>
            </View>
          </Picker>
        </View>
        <View className='card-config-row'>
          <Text className='card-config-label'>三级标题</Text>
          <Picker
            mode='selector'
            range={CARD_FONT_SCALE_OPTIONS.map((item) => item.title)}
            value={cardH3FontScaleIndex}
            onChange={(event) => {
              const idx = Number(event.detail.value);
              const picked = CARD_FONT_SCALE_OPTIONS[idx];
              if (picked) setCardH3FontScale(picked.id);
            }}
          >
            <View className='picker-chip'>
              <Text className='picker-chip-text'>{CARD_FONT_SCALE_OPTIONS[cardH3FontScaleIndex]?.title || '16'}</Text>
            </View>
          </Picker>
        </View>
        <View className='card-config-row'>
          <Text className='card-config-label'>正文字号</Text>
          <Picker
            mode='selector'
            range={CARD_FONT_SCALE_OPTIONS.map((item) => item.title)}
            value={cardBodyFontScaleIndex}
            onChange={(event) => {
              const idx = Number(event.detail.value);
              const picked = CARD_FONT_SCALE_OPTIONS[idx];
              if (picked) setCardBodyFontScale(picked.id);
            }}
          >
            <View className='picker-chip'>
              <Text className='picker-chip-text'>{CARD_FONT_SCALE_OPTIONS[cardBodyFontScaleIndex]?.title || '16'}</Text>
            </View>
          </Picker>
        </View>
        <View className='card-config-row'>
          <Text className='card-config-label'>主色方案</Text>
          <View className='card-config-chips'>
            {CARD_THEME_COLOR_OPTIONS.map((item) => (
              <View
                key={item.id}
                className={`tiny-chip ${cardThemeColor === item.id ? 'tiny-chip--active' : ''}`}
                onClick={() => setCardThemeColor(item.id)}
              >
                <Text className={`tiny-chip-text ${cardThemeColor === item.id ? 'tiny-chip-text--active' : ''}`}>{item.title}</Text>
              </View>
            ))}
          </View>
        </View>
        <View className='card-config-row'>
          <Text className='card-config-label'>卡片圆角</Text>
          <View className='card-config-chips'>
            {CARD_RADIUS_OPTIONS.map((item) => (
              <View
                key={item.id}
                className={`tiny-chip ${cardRadius === item.id ? 'tiny-chip--active' : ''}`}
                onClick={() => setCardRadius(item.id)}
              >
                <Text className={`tiny-chip-text ${cardRadius === item.id ? 'tiny-chip-text--active' : ''}`}>{item.title}</Text>
              </View>
            ))}
          </View>
        </View>
        <View className='card-config-row'>
          <Text className='card-config-label'>标题间距</Text>
          <View className='card-config-chips'>
            {CARD_HEADING_SPACING_OPTIONS.map((item) => (
              <View
                key={item.id}
                className={`tiny-chip ${cardHeadingSpacing === item.id ? 'tiny-chip--active' : ''}`}
                onClick={() => setCardHeadingSpacing(item.id)}
              >
                <Text className={`tiny-chip-text ${cardHeadingSpacing === item.id ? 'tiny-chip-text--active' : ''}`}>{item.title}</Text>
              </View>
            ))}
          </View>
        </View>
        <View className='card-config-row'>
          <Text className='card-config-label'>内边距</Text>
          <View className='card-config-chips'>
            {CARD_PADDING_OPTIONS.map((item) => (
              <View
                key={item.id}
                className={`tiny-chip ${cardPadding === item.id ? 'tiny-chip--active' : ''}`}
                onClick={() => setCardPadding(item.id)}
              >
                <Text className={`tiny-chip-text ${cardPadding === item.id ? 'tiny-chip-text--active' : ''}`}>{item.title}</Text>
              </View>
            ))}
          </View>
        </View>
        <View className='card-config-row'>
          <Text className='card-config-label'>字体族</Text>
          <Picker
            mode='selector'
            range={CARD_FONT_FAMILY_OPTIONS.map((item) => item.title)}
            value={cardFontFamilyIndex}
            onChange={(event) => {
              const idx = Number(event.detail.value);
              const picked = CARD_FONT_FAMILY_OPTIONS[idx];
              if (picked) setCardFontFamily(picked.id);
            }}
          >
            <View className='picker-chip'>
              <Text className='picker-chip-text'>{CARD_FONT_FAMILY_OPTIONS[cardFontFamilyIndex]?.title || '系统无衬线'}</Text>
            </View>
          </Picker>
        </View>
      </View>
    </View>
    );
  };

  const renderCardPresetSwitcher = () => (
    <>
      {renderSectionTitle('style', '预设风格')}
      <ScrollView
        scrollX
        className='style-preset-scroll'
        scrollLeft={stylePresetScrollLeft}
        onScroll={(event) => {
          stylePresetScrollLeftRef.current = Number(event.detail.scrollLeft) || 0;
        }}
      >
        <View className='style-preset-list'>
          {CARD_LAYOUT_STYLES.map((item) => {
            const active = selectedCardStyle === item.id;
            const displayMode = active
              ? selectedCardStyleModePreset || item.modes?.[0] || null
              : item.modes?.[0] || null;
            return (
              <View
                key={item.id}
                className={`style-preset-card ${active ? 'style-preset-card--active' : ''}`}
                onClick={() => {
                  setStylePresetScrollLeft(stylePresetScrollLeftRef.current);
                  setSelectedCardStyle(item.id);
                  const nextModes = item.modes || [];
                  if (nextModes.length === 0) {
                    setSelectedCardStyleMode('');
                  } else if (!nextModes.some((mode) => mode.id === selectedCardStyleMode)) {
                    setSelectedCardStyleMode(nextModes[0].id);
                  }
                  setCardPreviewImages([]);
                  if (!cardMarkdown.trim()) {
                    setCardUserCleared(false);
                    setCardMarkdown(item.defaultMarkdown);
                  }
                }}
              >
                <View
                  className={`style-preset-thumb ${item.previewCardClassName || ''}`.trim()}
                  style={buildPreviewBackgroundStyle(displayMode?.previewBackground || item.previewBackground)}
                >
                  <Text
                    className='style-preset-thumb-title'
                    style={{ color: displayMode?.textColor || item.textColor }}
                  >
                    {item.title}
                  </Text>
                  <View className='style-preset-color-row'>
                    {(displayMode?.colors || item.colors).map((color, idx) => (
                      <View
                        key={`${item.id}-color-${idx}`}
                        className='style-preset-color-dot'
                        style={buildColorSwatchStyle(color)}
                      />
                    ))}
                  </View>
                </View>
                <View className='style-preset-meta'>
                  <Text className={`style-preset-name ${active ? 'style-preset-name--active' : ''}`}>{item.title}</Text>
                  <Text className={`style-preset-desc ${active ? 'style-preset-desc--active' : ''}`}>{item.desc}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
      {!!selectedCardStylePreset.modes?.length && (
        <View className='card-config-row card-config-row--mode-only'>
          <Text className='card-config-label'>风格模式</Text>
          <View className='card-config-chips'>
            {selectedCardStylePreset.modes?.map((mode) => (
              <View
                key={mode.id}
                className={`tiny-chip ${selectedCardStyleMode === mode.id ? 'tiny-chip--active' : ''}`}
                onClick={() => setSelectedCardStyleMode(mode.id)}
              >
                <Text className={`tiny-chip-text ${selectedCardStyleMode === mode.id ? 'tiny-chip-text--active' : ''}`}>{mode.title}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </>
  );

  const fixedSubmitting = activeFeature === 'ai-image'
    ? aiSubmitting
    : activeFeature === 'infographic'
      ? infoSubmitting
      : cardSubmitting;
  const showFixedSubmit = activeFeature !== 'card-layout';

  const fixedSubmitLabel = activeFeature === 'ai-image'
    ? (aiSubmitting ? '生成中...' : '立即生成')
    : activeFeature === 'infographic'
      ? (infoSubmitting ? '提交中...' : '开始创作')
      : (cardSubmitting ? '处理中...' : '生成并发布');
  const cardPreviewActionLabel = cardExporting || cardSubmitting
    ? '处理中...'
    : cardWechatMode
      ? '复制到公众号'
      : hotRewriteReturnTaskId
        ? '一键生成'
        : '一键导出';

  const handleFixedSubmit = () => {
    if (activeFeature === 'ai-image') {
      void handleCreateAiImage();
      return;
    }
    if (activeFeature === 'infographic') {
      void handleCreateInfographic();
      return;
    }
    void handleCreateCard();
  };
  const bottomComposerTitle = activeFeature === 'ai-image'
    ? '图片创意描述'
    : activeFeature === 'infographic'
      ? '输入内容'
      : '粘贴 Markdown / 文案';
  const bottomComposerValue = activeFeature === 'ai-image'
    ? aiPrompt
    : activeFeature === 'infographic'
      ? infoContent
      : cardMarkdown;
  const bottomComposerMaxLength = activeFeature === 'ai-image'
    ? 800
    : activeFeature === 'infographic'
      ? 1200
      : 2400;
  const bottomComposerPlaceholder = activeFeature === 'ai-image'
    ? '请用一句话描述您的创意...'
    : activeFeature === 'infographic'
      ? '输入或粘贴文案，系统会按所选模板排版成信息图。'
      : '粘贴网页端的小红书 Markdown，自动转卡片布局。';
  const handleBottomComposerInput = (value: string) => {
    if (activeFeature === 'ai-image') {
      setAiPrompt(value);
      return;
    }
    if (activeFeature === 'infographic') {
      setInfoContent(value);
      return;
    }
    setCardUserCleared(activeFeature === 'card-layout' && !value.trim());
    setCardMarkdown(value);
    setCardPreviewImages([]);
  };

  const renderPromptComposerCard = () => (
    <View className='image-gen-bottom-composer-card image-gen-prompt-composer-card'>
      <View className='image-gen-bottom-title-row'>
        <Text className='image-gen-bottom-title'>{bottomComposerTitle}</Text>
        <View className='image-gen-bottom-title-actions'>
          <Text
            className='quick-action'
            onClick={() => {
              if (activeFeature === 'ai-image') {
                setAiPrompt('');
                return;
              }
              if (activeFeature === 'infographic') {
                setInfoContent('');
                return;
              }
              setCardMarkdown('');
            }}
          >
            清空
          </Text>
          <Text className='image-gen-bottom-count'>{bottomComposerValue.length}/{bottomComposerMaxLength}</Text>
        </View>
      </View>
      <Textarea
        className='image-gen-bottom-textarea'
        value={bottomComposerValue}
        onInput={(e) => handleBottomComposerInput(e.detail.value)}
        placeholder={bottomComposerPlaceholder}
        maxlength={bottomComposerMaxLength}
        autoHeight
        adjustPosition
        cursorSpacing={80}
      />
      {activeFeature !== 'ai-image' && (
        <View className='image-gen-bottom-footer'>
          <View className='info-input-actions info-input-actions--bottom'>
            <View className='input-action-btn' onClick={handleFindInspiration}>
              <Text className='input-action-btn-text'>没有文案？去找灵感</Text>
            </View>
            <View
              className='input-action-btn input-action-btn--ghost'
              onClick={activeFeature === 'infographic' ? handlePasteInfoContent : handlePasteCardMarkdown}
            >
              <Text className='input-action-btn-text input-action-btn-text--ghost'>粘贴</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );

  const handleClearCardMarkdown = () => {
    setCardUserCleared(true);
    setCardMarkdown('');
    setCardPreviewImages([]);
  };
  const isCardLayoutEditMode = activeFeature === 'card-layout' && cardEditorMode === 'edit';

  return (
    <View className='image-gen-root'>
      <View className={`image-gen-page ${showFixedSubmit ? '' : 'image-gen-page--no-fixed-submit'} ${isCardLayoutEditMode ? 'image-gen-page--card-edit' : ''}`}>
        <View className='image-gen-header'>
          <View className='image-gen-topbar'>
            <View className='image-gen-back' onClick={handleBack}>
              <Text className='image-gen-back-text'>‹</Text>
            </View>
            <Text className='image-gen-page-title'>图片生成</Text>
          </View>
          <View className='top-switch-tabs'>
            {FEATURE_TABS.map((item) => (
              <View
                key={item.key}
                className={`top-switch-tab ${activeFeature === item.key ? 'top-switch-tab--active' : ''}`}
                onClick={() => setActiveFeature(item.key)}
              >
                <Text className='top-switch-label'>{item.label}</Text>
                {activeFeature === item.key && <View className='top-switch-underline' />}
              </View>
            ))}
          </View>
        </View>

        {activeFeature === 'ai-image' && (
          <View className='panel'>
            {renderSectionTitle('upload', '添加参考图')}
            <Text className='section-hint'>当前模型最多支持 {maxAiReferenceImages} 张参考图。</Text>
            <View className='image-grid'>
              {refImages.map((src, idx) => (
                <View key={`${src}-${idx}`} className='thumb-wrap'>
                  <Image className='thumb' src={src} mode='aspectFill' />
                  <View className='thumb-delete' onClick={() => setRefImages((prev) => prev.filter((_, i) => i !== idx))}>
                    <Text className='thumb-delete-text'>×</Text>
                  </View>
                </View>
              ))}
              {refImages.length < maxAiReferenceImages && (
                <View className='thumb-add' onClick={handleChooseImages}>
                  <Text className='thumb-add-plus'>+</Text>
                  <Text className='thumb-add-text'>添加图片</Text>
                </View>
              )}
            </View>

            {renderSectionTitle('model', '模型选择')}
            <ScrollView scrollX className='model-scroll'>
              <View className='model-list'>
                {IMAGE_MODELS.map((item) => (
                  <View
                    key={item.key}
                    className={`model-card ${selectedModel === item.key ? 'model-card--active' : ''}`}
                    onClick={() => setSelectedModel(item.key)}
                  >
                    <View className='model-row'>
                      <Text className='model-name'>{item.name}</Text>
                      {item.badge && <Text className='model-badge'>{item.badge}</Text>}
                    </View>
                    <Text className='model-desc'>{item.desc}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>

            {renderSectionTitle('preview', '图片比例')}
            <ScrollView scrollX className='aspect-scroll'>
              <View className='aspect-option-list'>
                {IMAGE_ASPECT_OPTIONS.map((item) => (
                  <View
                    key={item.key}
                    className={`aspect-option ${selectedImageAspect === item.key ? 'aspect-option--active' : ''}`}
                    onClick={() => setSelectedImageAspect(item.key)}
                  >
                    <View className='aspect-option-visual-wrap'>
                      <View className={`aspect-option-visual aspect-option-visual--${item.key.replace(':', 'x')}`} />
                    </View>
                    <Text className={`aspect-option-label ${selectedImageAspect === item.key ? 'aspect-option-label--active' : ''}`}>
                      {item.label}
                    </Text>
                    <Text className={`aspect-option-value ${selectedImageAspect === item.key ? 'aspect-option-value--active' : ''}`}>
                      {item.key}
                    </Text>
                    <Text className={`aspect-option-desc ${selectedImageAspect === item.key ? 'aspect-option-desc--active' : ''}`}>
                      {item.desc}
                    </Text>
                  </View>
                ))}
              </View>
            </ScrollView>

            {renderPromptComposerCard()}

          </View>
        )}

        {activeFeature === 'infographic' && (
          <View className='panel'>
            {renderSectionTitle('template', '选择信息图模板')}
            {templatesLoading && <Text className='section-hint'>模板同步中...</Text>}
            <ScrollView scrollX className='template-scroll'>
              <View className='template-list'>
                {infographicTemplates.map((tpl) => (
                  <View
                    key={tpl.id}
                    className={`template-card template-card--portrait ${selectedTemplate === tpl.id ? 'template-card--active' : ''}`}
                    onClick={() => setSelectedTemplate(tpl.id)}
                  >
                    <Image className='template-preview' src={tpl.preview} mode='aspectFill' lazyLoad />
                    <View className='template-overlay'>
                      <Text className='template-title'>{tpl.title}</Text>
                    </View>
                  </View>
                ))}
                <View className='template-add-card template-add-card--portrait' onClick={handleAddTemplate}>
                  <Text className='template-add-plus'>+</Text>
                  <Text className='template-add-text'>新增模板</Text>
                </View>
              </View>
            </ScrollView>

            {renderSectionTitle('model', '生成张数')}
            <View className='count-option-row'>
              {INFOGRAPHIC_COUNT_OPTIONS.map((count) => (
                <View
                  key={count}
                  className={`count-option ${infographicCount === count ? 'count-option--active' : ''}`}
                  onClick={() => setInfographicCount(count)}
                >
                  <Text className={`count-option-text ${infographicCount === count ? 'count-option-text--active' : ''}`}>
                    {count}张
                  </Text>
                </View>
              ))}
            </View>

            {renderPromptComposerCard()}

          </View>
        )}

        {activeFeature === 'card-layout' && (
          <View className='panel'>
            <View className='card-topbar'>
              <View className='card-mode-toggle'>
                <View
                  className={`card-mode-btn ${cardEditorMode === 'edit' ? 'card-mode-btn--active' : ''}`}
                  onClick={() => setCardEditorMode('edit')}
                >
                  <Text className={`card-mode-btn-text ${cardEditorMode === 'edit' ? 'card-mode-btn-text--active' : ''}`}>编辑</Text>
                </View>
              <View
                className={`card-mode-btn ${cardEditorMode === 'preview' ? 'card-mode-btn--active' : ''}`}
                onClick={() => setCardEditorMode('preview')}
              >
                  <Text className={`card-mode-btn-text ${cardEditorMode === 'preview' ? 'card-mode-btn-text--active' : ''}`}>预览</Text>
                </View>
              </View>
              <View
                className={`card-wechat-toggle ${cardWechatMode ? 'card-wechat-toggle--active' : ''}`}
                onClick={() => {
                  setCardWechatMode((prev) => !prev);
                  setCardPreviewImages([]);
                  setCardPreviewPageIndex(0);
                  setCardEditorMode('preview');
                }}
              >
                <Text className={`card-wechat-toggle-text ${cardWechatMode ? 'card-wechat-toggle-text--active' : ''}`}>公众号</Text>
                <View className={`card-wechat-toggle-switch ${cardWechatMode ? 'card-wechat-toggle-switch--active' : ''}`}>
                  <View className='card-wechat-toggle-dot' />
                </View>
              </View>
              <View
                className={`card-setting-trigger ${cardSettingsOpen ? 'card-setting-trigger--active' : ''}`}
                onClick={() => setCardSettingsOpen((prev) => !prev)}
              >
                <Text className={`card-setting-trigger-text ${cardSettingsOpen ? 'card-setting-trigger-text--active' : ''}`}>⚙</Text>
              </View>
            </View>

            {cardEditorMode === 'edit' && (
              <>
                {renderSectionTitle('markdown', '粘贴 Markdown / 文案')}
                <View className='info-input-box info-input-box--card-editor'>
                  <View className='info-input-actions info-input-actions--card-editor'>
                    <View className='input-action-btn' onClick={handleFindInspiration}>
                      <Text className='input-action-btn-text'>没有文案？去找灵感</Text>
                    </View>
                    <View className='input-action-btn input-action-btn--ghost' onClick={handleClearCardMarkdown}>
                      <Text className='input-action-btn-text input-action-btn-text--ghost'>清空</Text>
                    </View>
                    <View className='input-action-btn input-action-btn--ghost' onClick={handlePasteCardMarkdown}>
                      <Text className='input-action-btn-text input-action-btn-text--ghost'>粘贴</Text>
                    </View>
                    <View className='input-action-btn input-action-btn--ghost' onClick={() => void handleOptimizeCardMarkdown()}>
                      <Text className='input-action-btn-text input-action-btn-text--ghost'>
                        <Text className='input-action-btn-icon'>✦</Text>
                        {cardOptimizing ? '排版中...' : 'AI排版'}
                      </Text>
                    </View>
                  </View>
                  <Textarea
                    className='textarea textarea--info textarea--card-editor'
                    value={cardMarkdown}
                    autoHeight
                    adjustPosition
                    cursorSpacing={140}
                    showConfirmBar={false}
                    onInput={(e) => {
                      const value = e.detail.value;
                      setCardUserCleared(!value.trim());
                      setCardMarkdown(value);
                      setCardPreviewImages([]);
                    }}
                    placeholder='粘贴网页端的小红书 Markdown，自动转卡片布局。'
                    maxlength={8000}
                  />
                </View>
              </>
            )}

            {cardEditorMode === 'preview' && (
              <>
                {renderSectionTitle('preview', cardWechatMode ? '公众号预览' : '排版预览')}
                {cardWechatMode && (
                  <View className='card-wechat-mode-note'>
                    <Text className='card-wechat-mode-note-title'>公众号正文模式</Text>
                    <Text className='card-wechat-mode-note-text'>预览按公众号正文宽度展示，导出会复制 HTML 草稿。</Text>
                  </View>
                )}
                {cardWechatMode ? (
                  <View className='wechat-preview-long-wrap'>
                    <View className={cardPreviewThemeClass} style={cardPreviewThemeInlineStyle}>
                      <View className={cardPreviewContentShellClass} style={cardPreviewContentInlineStyle}>
                        <RichText className={cardPreviewRichtextClass} nodes={cardWechatPreviewHtml} />
                      </View>
                    </View>
                  </View>
                ) : (
                  <View className='preview-swiper-wrap'>
                    <Swiper
                      className='preview-swiper'
                      indicatorDots={false}
                      circular={false}
                      current={cardPreviewPageIndex}
                      onChange={(event) => setCardPreviewPageIndex(event.detail.current)}
                    >
                      {cardPreviewPages.map((html, idx) => (
                        <SwiperItem key={`preview-page-${idx}`}>
                          <View className='preview-swiper-item'>
                            <View className={`preview-card ${cardPreviewThemeClass}`} style={cardPreviewThemeInlineStyle}>
                              {selectedCardStyle === 'apple-notes' && (
                                <View className='preview-apple-header'>
                                  <View className='preview-apple-header-left'>
                                    <Text className='preview-apple-header-icon'>‹</Text>
                                    <Text className='preview-apple-header-title'>备忘录</Text>
                                  </View>
                                  <View className='preview-apple-header-right'>
                                    <Text className='preview-apple-header-icon'>↥</Text>
                                    <Text className='preview-apple-header-icon'>◌</Text>
                                  </View>
                                </View>
                              )}
                              <View className={cardPreviewContentShellClass} style={cardPreviewContentInlineStyle}>
                                <RichText className={cardPreviewRichtextClass} nodes={html} />
                              </View>
                            </View>
                          </View>
                        </SwiperItem>
                      ))}
                    </Swiper>
                    <View className='preview-swiper-indicator'>
                      <Text className='preview-swiper-indicator-text'>{cardPreviewPageIndex + 1}/{cardPreviewPages.length}</Text>
                    </View>
                  </View>
                )}
                <View
                  className={`card-preview-render-btn ${cardExporting || cardSubmitting ? 'card-preview-render-btn--loading' : ''}`}
                  onClick={() => {
                    if (hotRewriteReturnTaskId && !cardWechatMode) {
                      void handleCreateCard();
                      return;
                    }
                    void handleExportCardImages();
                  }}
                >
                  <Text className='card-preview-render-btn-text'>
                    {cardPreviewActionLabel}
                  </Text>
                </View>
                {!cardWechatMode && renderCardPresetSwitcher()}
              </>
            )}
            {cardPreviewImages.length > 0 && (
              <View className='card-preview-export-wrap'>
                <View className='card-preview-export-row'>
                  <Text className='card-preview-export-title'>已生成图片</Text>
                  {hotRewriteReturnTaskId && (
                    <View className='card-return-btn' onClick={() => returnToHotRewrite()}>
                      <Text className='card-return-btn-text'>返回仿写结果</Text>
                    </View>
                  )}
                </View>
                <ScrollView scrollX className='card-preview-image-scroll'>
                  <View className='card-preview-image-list'>
                    {cardPreviewImages.map((url, idx) => (
                      <Image key={`${url}-${idx}`} className='card-preview-image' src={url} mode='widthFix' />
                    ))}
                  </View>
                </ScrollView>
                {!!cardPublishQrcode && (
                  <View className='card-publish-qrcode-card'>
                    <Text className='card-publish-qrcode-title'>小红书发布二维码</Text>
                    <Image className='card-publish-qrcode-image' src={buildQrcodeImageSrc(cardPublishQrcode)} mode='aspectFit' />
                  </View>
                )}
              </View>
            )}
          </View>
        )}
      </View>

      {activeFeature === 'card-layout' && cardSettingsOpen && (
        <View className='card-settings-overlay' onClick={() => setCardSettingsOpen(false)}>
          <View
            className='card-settings-drawer'
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <View className='card-settings-drawer-header'>
              <Text className='card-settings-drawer-title'>设置</Text>
              <View className='card-settings-drawer-close' onClick={() => setCardSettingsOpen(false)}>
                <Text className='card-settings-drawer-close-text'>关闭</Text>
              </View>
            </View>
            <ScrollView scrollY className='card-settings-drawer-scroll'>
              {renderCardSettingsPanel()}
            </ScrollView>
          </View>
        </View>
      )}

      {showFixedSubmit && (
        <View className='image-gen-fixed-submit'>
          <View className={`cta-btn ${fixedSubmitting ? 'cta-btn--disabled' : ''}`} onClick={handleFixedSubmit}>
            <Text className='cta-btn-text'>{fixedSubmitLabel}</Text>
          </View>
        </View>
      )}
    </View>
  );
}
