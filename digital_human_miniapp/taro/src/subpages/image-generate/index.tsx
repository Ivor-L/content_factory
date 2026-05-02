import { View, Text, ScrollView, Textarea, Image, Input, RichText, Swiper, SwiperItem } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { miniappApi } from '../../utils/miniapp-api';
import { api } from '../../utils/api';
import tplImage1 from '../../assets/home-icons-v2/image.webp';
import tplImage2 from '../../assets/home-icons-v2/edit.webp';
import tplImage3 from '../../assets/home-icons-v2/copy.webp';
import tplImage4 from '../../assets/home-icons-v2/video.webp';
import tplImage5 from '../../assets/home-icons-v2/swap.webp';
import tplImage6 from '../../assets/home-icons-v2/human.webp';
import './index.sass';

type FeatureKey = 'ai-image' | 'infographic' | 'card-layout';

type InfographicTemplate = {
  id: string;
  title: string;
  tag: string;
  preview: string;
  status?: string | null;
};

const FEATURE_TABS: Array<{ key: FeatureKey; label: string }> = [
  { key: 'ai-image', label: 'AI作图' },
  { key: 'infographic', label: '信息图' },
  { key: 'card-layout', label: '图文卡片' },
];

const IMAGE_MODELS = [
  { key: 'gpt-image-2-all', name: 'gpt-image-2', desc: '细节表现优秀，适合精细创作', badge: '推荐' },
  { key: 'nano-banana-pro', name: 'nano-Banana-Pro-3', desc: '综合能力强，适合多种创意场景' },
];

const FALLBACK_INFOGRAPHIC_TEMPLATES: InfographicTemplate[] = [
  { id: 'product', title: '产品测评卡', tag: '示例模板', preview: tplImage1 },
  { id: 'step', title: '步骤指南卡', tag: '示例模板', preview: tplImage2 },
  { id: 'compare', title: '对比清单卡', tag: '示例模板', preview: tplImage3 },
  { id: 'quote', title: '金句观点卡', tag: '示例模板', preview: tplImage4 },
  { id: 'qa', title: '问答解析卡', tag: '示例模板', preview: tplImage5 },
  { id: 'story', title: '故事拆解卡', tag: '示例模板', preview: tplImage6 },
];

type CardStyleId =
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
type CardDensity = 'compact' | 'balanced' | 'relaxed';
type CardFontScale = 'sm' | 'md' | 'lg';
type CardThemeColor = 'amber' | 'blue' | 'green' | 'rose';
type CardRadius = 'sm' | 'md' | 'lg';
type CardHeadingSpacing = 'tight' | 'normal' | 'wide';
type CardFontFamily = 'system' | 'source-han' | 'puhui';
type CardCoverMode = 'auto' | 'custom';
type CardEditorMode = 'edit' | 'preview';
type CardCoverStyleId =
  | 'image-focus'
  | 'grid-paper'
  | 'rounded-gray-note'
  | 'pastel-purple-cat'
  | 'warm-gray-dog'
  | 'lined-notebook'
  | 'lime-question'
  | 'mint-splash';

type CardStylePreset = {
  id: CardStyleId;
  title: string;
  desc: string;
  colors: string[];
  defaultMarkdown: string;
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

const CARD_LAYOUT_STYLES: CardStylePreset[] = [
  {
    id: 'cinematic-film',
    title: '电影胶片',
    desc: 'Cinematic Film',
    colors: ['#121211', '#1f1d1a', '#d9c8a6'],
    defaultMarkdown: DEFAULT_CARD_MARKDOWN,
  },
  {
    id: 'starry-night',
    title: '星光质感',
    desc: 'Starry Night',
    colors: ['#0f1e3a', '#1f3d73', '#ffd870'],
    defaultMarkdown: DEFAULT_CARD_MARKDOWN,
  },
  {
    id: 'polaroid',
    title: '复古拍立得',
    desc: 'Polaroid',
    colors: ['#d7d2cc', '#efe8df', '#9b4d3a'],
    defaultMarkdown: DEFAULT_CARD_MARKDOWN,
  },
  {
    id: 'notion-style',
    title: '效率笔记',
    desc: 'Notion Style',
    colors: ['#f7f6f3', '#efede8', '#0f7b6c'],
    defaultMarkdown: DEFAULT_CARD_MARKDOWN,
  },
  {
    id: 'elegant-book',
    title: '书籍内页',
    desc: 'Elegant Book',
    colors: ['#fdfbf7', '#f4efe6', '#8c3a3a'],
    defaultMarkdown: DEFAULT_CARD_MARKDOWN,
  },
  {
    id: 'ios-memo',
    title: '苹果备忘录',
    desc: 'iOS Memo',
    colors: ['#fff9dd', '#fef3c7', '#c99500'],
    defaultMarkdown: DEFAULT_CARD_MARKDOWN,
  },
  {
    id: 'swiss-studio',
    title: '苏黎世工作室',
    desc: 'Swiss Studio',
    colors: ['#ffffff', '#f7f7f7', '#ff3b30'],
    defaultMarkdown: DEFAULT_CARD_MARKDOWN,
  },
  {
    id: 'minimalist-magazine',
    title: '极简杂志',
    desc: 'Minimalist Magazine',
    colors: ['#fcfcfb', '#f5f5f4', '#111111'],
    defaultMarkdown: DEFAULT_CARD_MARKDOWN,
  },
  {
    id: 'aura-gradient',
    title: '弥散极光',
    desc: 'Aura Gradient',
    colors: ['linear-gradient(135deg,#ffdff4,#dfe7ff)', '#ffdff4', '#dfe7ff', '#6f4ee6'],
    defaultMarkdown: DEFAULT_CARD_MARKDOWN,
  },
  {
    id: 'deep-night',
    title: '暗夜深思',
    desc: 'Deep Night',
    colors: ['#0b1020', '#101a34', '#00d4ff'],
    defaultMarkdown: DEFAULT_CARD_MARKDOWN,
  },
  {
    id: 'pro-doc',
    title: '大厂文档',
    desc: 'Pro Doc',
    colors: ['#f8fbff', '#f3f6fb', '#2563eb'],
    defaultMarkdown: DEFAULT_CARD_MARKDOWN,
  },
  {
    id: 'blank',
    title: '空白模板',
    desc: 'Blank',
    colors: ['#ffffff', '#f7f7f7', '#1a1a1a'],
    defaultMarkdown: DEFAULT_CARD_MARKDOWN,
  },
];

const CARD_DENSITY_OPTIONS: Array<{ id: CardDensity; title: string }> = [
  { id: 'compact', title: '紧凑' },
  { id: 'balanced', title: '均衡' },
  { id: 'relaxed', title: '舒展' },
];

const CARD_FONT_SCALE_OPTIONS: Array<{ id: CardFontScale; title: string }> = [
  { id: 'sm', title: '小字' },
  { id: 'md', title: '中字' },
  { id: 'lg', title: '大字' },
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
];

const CARD_COVER_MODE_OPTIONS: Array<{ id: CardCoverMode; title: string }> = [
  { id: 'auto', title: '自动提取' },
  { id: 'custom', title: '自定义' },
];

const CARD_COVER_STYLE_OPTIONS: Array<{ id: CardCoverStyleId; title: string; desc: string; preview: string }> = [
  { id: 'image-focus', title: '图像主视觉', desc: '偏沉浸感封面', preview: 'linear-gradient(135deg,#3d2f26,#8b6a57 45%,#ccb18f)' },
  { id: 'grid-paper', title: '方格手账', desc: '纸感清爽', preview: 'linear-gradient(135deg,#f5f5f3,#edf2f1)' },
  { id: 'rounded-gray-note', title: '圆角灰卡', desc: '柔和圆角', preview: 'linear-gradient(135deg,#f3f3f3,#dedede)' },
  { id: 'pastel-purple-cat', title: '紫调猫咪', desc: '轻松活泼', preview: 'linear-gradient(135deg,#d8d2ee,#c7bfe6)' },
  { id: 'warm-gray-dog', title: '暖灰小狗', desc: '暖色调', preview: 'linear-gradient(135deg,#e6e4df,#d9d7d1)' },
  { id: 'lined-notebook', title: '横线本', desc: '笔记感', preview: 'linear-gradient(135deg,#f8f8f8,#eceef2)' },
  { id: 'lime-question', title: '亮黄提问', desc: '高对比吸睛', preview: 'linear-gradient(135deg,#e9ef97,#d9e66e)' },
  { id: 'mint-splash', title: '薄荷气泡', desc: '柔亮清新', preview: 'linear-gradient(135deg,#bde8ea,#92d8db)' },
];

const CARD_MAX_PAGE_OPTIONS = [4, 6, 8, 10];
const IMAGE_GENERATE_PREFS_KEY = 'IMAGE_GENERATE_PREFS_V1';

type ImageGeneratePrefs = {
  activeFeature?: FeatureKey;
  selectedModel?: string;
  selectedTemplate?: string;
  selectedCardStyle?: CardStyleId;
  cardIncludeCover?: boolean;
  cardMaxPages?: number;
  cardDensity?: CardDensity;
  cardFontScale?: CardFontScale;
  cardThemeColor?: CardThemeColor;
  cardRadius?: CardRadius;
  cardHeadingSpacing?: CardHeadingSpacing;
  cardFontFamily?: CardFontFamily;
  cardCoverMode?: CardCoverMode;
  cardCoverStyleId?: CardCoverStyleId;
  cardCoverTitle?: string;
  cardCoverSubtitle?: string;
  cardEditorMode?: CardEditorMode;
  cardSettingsOpen?: boolean;
};

const CARD_TEMPLATE_BG_CLASS_MAP: Record<CardStyleId, string> = {
  'cinematic-film': 'preview-card--cinematic-film',
  'starry-night': 'preview-card--starry-night',
  polaroid: 'preview-card--polaroid',
  'notion-style': 'preview-card--notion-style',
  'elegant-book': 'preview-card--elegant-book',
  'ios-memo': 'preview-card--ios-memo',
  'swiss-studio': 'preview-card--swiss-studio',
  'minimalist-magazine': 'preview-card--minimalist-magazine',
  'aura-gradient': 'preview-card--aura-gradient',
  'deep-night': 'preview-card--deep-night',
  'pro-doc': 'preview-card--pro-doc',
  blank: 'preview-card--blank',
};

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
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
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

function renderMiniMarkdown(markdown: string): string {
  const normalizedMarkdown = (markdown || '')
    .replace(/\r\n/g, '\n')
    .replace(/<\/?details[^>]*>/gi, '')
    .replace(/<\/?summary[^>]*>/gi, '');
  const lines = normalizedMarkdown.split('\n');
  const blocks: string[] = [];
  let inUl = false;
  let inOl = false;
  let inCode = false;
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

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      closeLists();
      if (!inCode) {
        inCode = true;
        blocks.push('<pre class="md-pre"><code>');
      } else {
        inCode = false;
        blocks.push('</code></pre>');
      }
      continue;
    }

    if (inCode) {
      blocks.push(`${escapeHtml(line)}\n`);
      continue;
    }

    if (!trimmed) {
      closeLists();
      blocks.push('<p class="md-spacer"></p>');
      continue;
    }

    const hMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (hMatch) {
      closeLists();
      const level = Math.min(3, hMatch[1].length);
      blocks.push(`<h${level}>${parseInlineMarkdown(hMatch[2])}</h${level}>`);
      continue;
    }

    const quoteMatch = trimmed.match(/^>\s*(.+)$/);
    if (quoteMatch) {
      closeLists();
      blocks.push(`<blockquote>${parseInlineMarkdown(quoteMatch[1])}</blockquote>`);
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
        blocks.push('<ul>');
      }
      blocks.push(`<li>${parseInlineMarkdown(ulMatch[1])}</li>`);
      continue;
    }

    const olMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      if (inUl) {
        blocks.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        inOl = true;
        blocks.push('<ol>');
      }
      blocks.push(`<li>${parseInlineMarkdown(olMatch[1])}</li>`);
      continue;
    }

    const hrMatch = trimmed.match(/^(-{3,}|\*{3,}|_{3,})$/);
    if (hrMatch) {
      closeLists();
      blocks.push('<hr />');
      continue;
    }

    const imageMatch = trimmed.match(/^!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)$/);
    if (imageMatch) {
      closeLists();
      blocks.push(`<img class="md-image" src="${escapeAttr(imageMatch[2])}" alt="${escapeAttr(imageMatch[1])}" />`);
      continue;
    }

    closeLists();
    blocks.push(`<p>${parseInlineMarkdown(trimmed)}</p>`);
  }

  closeLists();
  if (inCode) blocks.push('</code></pre>');
  return blocks.join('');
}

function stripPreviewFrontmatter(markdown: string): string {
  const source = (markdown || '').replace(/\r\n/g, '\n');
  if (!source.startsWith('---\n')) return source;

  const end = source.indexOf('\n---\n', 4);
  if (end === -1) return source;
  return source.slice(end + 5);
}

function estimatePreviewLineWeight(line: string): number {
  const trimmed = (line || '').trim();
  if (!trimmed) return 0.55;
  if (/^#\s+/.test(trimmed)) return 3.6;
  if (/^##\s+/.test(trimmed)) return 3.1;
  if (/^#{3,6}\s+/.test(trimmed)) return 2.5;
  if (/^[-*+]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) return 1.9;
  if (/^>\s+/.test(trimmed)) return 1.8;
  if (/^```/.test(trimmed)) return 1.4;

  const pure = trimmed
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/^>\s+/, '');
  const len = Array.from(pure).length;
  return Math.min(3.4, 1.2 + len / 24);
}

function paginatePreviewMarkdown(
  markdown: string,
  maxPages: number,
  density: CardDensity,
  fontScale: CardFontScale,
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

  const densityFactor = density === 'compact' ? 1.2 : density === 'relaxed' ? 0.86 : 1;
  const fontFactor = fontScale === 'sm' ? 1.12 : fontScale === 'lg' ? 0.84 : 1;
  const maxUnits = 24 * densityFactor * fontFactor;

  const pages: string[] = [];
  let currentLines: string[] = [];
  let currentUnits = 0;

  for (const line of contentLines) {
    const weight = estimatePreviewLineWeight(line);
    if (currentLines.length > 0 && currentUnits + weight > maxUnits) {
      pages.push(currentLines.join('\n'));
      currentLines = [line];
      currentUnits = weight;
      continue;
    }
    currentLines.push(line);
    currentUnits += weight;
  }

  if (currentLines.length > 0) {
    pages.push(currentLines.join('\n'));
  }

  if (pages.length <= maxPages) return pages;

  const sliced = pages.slice(0, maxPages);
  const last = sliced[maxPages - 1];
  const lastLines = last.split('\n');
  if (lastLines.length === 0 || !lastLines[lastLines.length - 1].includes('...')) {
    lastLines.push('...');
  }
  sliced[maxPages - 1] = lastLines.join('\n');
  return sliced;
}

export default function ImageGeneratePage() {
  console.log('[image-generate] render start');
  const [activeFeature, setActiveFeature] = useState<FeatureKey>('ai-image');

  const [refImages, setRefImages] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState(IMAGE_MODELS[0].key);
  const [aiPrompt, setAiPrompt] = useState('');

  const [infographicTemplates, setInfographicTemplates] = useState<InfographicTemplate[]>(FALLBACK_INFOGRAPHIC_TEMPLATES);
  const [selectedTemplate, setSelectedTemplate] = useState(FALLBACK_INFOGRAPHIC_TEMPLATES[0].id);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [infoContent, setInfoContent] = useState('');
  const [infoSubmitting, setInfoSubmitting] = useState(false);
  const [aiSubmitting, setAiSubmitting] = useState(false);

  const [selectedCardStyle, setSelectedCardStyle] = useState<CardStyleId>(CARD_LAYOUT_STYLES[0].id);
  const [cardMarkdown, setCardMarkdown] = useState(CARD_LAYOUT_STYLES[0].defaultMarkdown);
  const [cardIncludeCover, setCardIncludeCover] = useState(true);
  const [cardMaxPages, setCardMaxPages] = useState(8);
  const [cardDensity, setCardDensity] = useState<CardDensity>('balanced');
  const [cardFontScale, setCardFontScale] = useState<CardFontScale>('md');
  const [cardThemeColor, setCardThemeColor] = useState<CardThemeColor>('amber');
  const [cardRadius, setCardRadius] = useState<CardRadius>('md');
  const [cardHeadingSpacing, setCardHeadingSpacing] = useState<CardHeadingSpacing>('normal');
  const [cardFontFamily, setCardFontFamily] = useState<CardFontFamily>('system');
  const [cardCoverMode, setCardCoverMode] = useState<CardCoverMode>('auto');
  const [cardCoverStyleId, setCardCoverStyleId] = useState<CardCoverStyleId>('image-focus');
  const [cardCoverTitle, setCardCoverTitle] = useState('');
  const [cardCoverSubtitle, setCardCoverSubtitle] = useState('');
  const [cardEditorMode, setCardEditorMode] = useState<CardEditorMode>('edit');
  const [cardSettingsOpen, setCardSettingsOpen] = useState(false);
  const [cardSubmitting, setCardSubmitting] = useState(false);
  const [cardPreviewImages, setCardPreviewImages] = useState<string[]>([]);
  const [cardPreviewPageIndex, setCardPreviewPageIndex] = useState(0);
  const [injectedFromMyNote, setInjectedFromMyNote] = useState(false);

  const selectedCardStylePreset = useMemo(
    () => CARD_LAYOUT_STYLES.find((item) => item.id === selectedCardStyle) || CARD_LAYOUT_STYLES[0],
    [selectedCardStyle],
  );

  useEffect(() => {
    if (cardMarkdown.trim()) return;
    setCardMarkdown(selectedCardStylePreset.defaultMarkdown);
  }, [cardMarkdown, selectedCardStylePreset.defaultMarkdown]);

  const selectedInfographicTemplate = useMemo(
    () => infographicTemplates.find((tpl) => tpl.id === selectedTemplate) || infographicTemplates[0] || null,
    [infographicTemplates, selectedTemplate],
  );

  useEffect(() => {
    try {
      const raw = Taro.getStorageSync(IMAGE_GENERATE_PREFS_KEY);
      if (!raw || typeof raw !== 'object') return;
      const prefs = raw as ImageGeneratePrefs;

      if (prefs.activeFeature && FEATURE_TABS.some((item) => item.key === prefs.activeFeature)) {
        setActiveFeature(prefs.activeFeature);
      }
      if (prefs.selectedModel && IMAGE_MODELS.some((item) => item.key === prefs.selectedModel)) {
        setSelectedModel(prefs.selectedModel);
      }
      if (prefs.selectedTemplate && typeof prefs.selectedTemplate === 'string') {
        setSelectedTemplate(prefs.selectedTemplate);
      }
      if (prefs.selectedCardStyle && CARD_LAYOUT_STYLES.some((item) => item.id === prefs.selectedCardStyle)) {
        setSelectedCardStyle(prefs.selectedCardStyle);
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
      if (prefs.cardFontScale && CARD_FONT_SCALE_OPTIONS.some((item) => item.id === prefs.cardFontScale)) {
        setCardFontScale(prefs.cardFontScale);
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
      if (prefs.cardFontFamily && CARD_FONT_FAMILY_OPTIONS.some((item) => item.id === prefs.cardFontFamily)) {
        setCardFontFamily(prefs.cardFontFamily);
      }
      if (prefs.cardCoverMode && CARD_COVER_MODE_OPTIONS.some((item) => item.id === prefs.cardCoverMode)) {
        setCardCoverMode(prefs.cardCoverMode);
      }
      if (prefs.cardCoverStyleId && CARD_COVER_STYLE_OPTIONS.some((item) => item.id === prefs.cardCoverStyleId)) {
        setCardCoverStyleId(prefs.cardCoverStyleId);
      }
      if (typeof prefs.cardCoverTitle === 'string') {
        setCardCoverTitle(prefs.cardCoverTitle.slice(0, 30));
      }
      if (typeof prefs.cardCoverSubtitle === 'string') {
        setCardCoverSubtitle(prefs.cardCoverSubtitle.slice(0, 40));
      }
      if (prefs.cardEditorMode && (prefs.cardEditorMode === 'edit' || prefs.cardEditorMode === 'preview')) {
        setCardEditorMode(prefs.cardEditorMode);
      }
      if (typeof prefs.cardSettingsOpen === 'boolean') {
        setCardSettingsOpen(prefs.cardSettingsOpen);
      }
    } catch {
      // ignore broken local prefs
    }
  }, []);

  useEffect(() => {
    const prefs: ImageGeneratePrefs = {
      activeFeature,
      selectedModel,
      selectedTemplate,
      selectedCardStyle,
      cardIncludeCover,
      cardMaxPages,
      cardDensity,
      cardFontScale,
      cardThemeColor,
      cardRadius,
      cardHeadingSpacing,
      cardFontFamily,
      cardCoverMode,
      cardCoverStyleId,
      cardCoverTitle,
      cardCoverSubtitle,
      cardEditorMode,
      cardSettingsOpen,
    };
    Taro.setStorageSync(IMAGE_GENERATE_PREFS_KEY, prefs);
  }, [
    activeFeature,
    selectedModel,
    selectedTemplate,
    selectedCardStyle,
    cardIncludeCover,
    cardMaxPages,
    cardDensity,
    cardFontScale,
    cardThemeColor,
    cardRadius,
    cardHeadingSpacing,
    cardFontFamily,
    cardCoverMode,
    cardCoverStyleId,
    cardCoverTitle,
    cardCoverSubtitle,
    cardEditorMode,
    cardSettingsOpen,
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
        preview: style.previewUrl || FALLBACK_INFOGRAPHIC_TEMPLATES[idx % FALLBACK_INFOGRAPHIC_TEMPLATES.length].preview,
        status: style.status,
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
    console.log('[image-generate] did show');
    void loadInfographicTemplates();

    // Optional prefill from "我的笔记仿写结果"
    if (!injectedFromMyNote) {
      const raw = Taro.getStorageSync('MY_NOTE_REWRITE_PAYLOAD');
      if (raw && typeof raw === 'object') {
        const payload = raw as {
          targetFeature?: 'infographic' | 'card-layout';
          title?: string;
          body?: string;
          imageTexts?: string[];
        };
        const target = payload.targetFeature === 'infographic' ? 'infographic' : 'card-layout';
        const title = String(payload.title || '').trim();
        const body = String(payload.body || '').trim();
        const imageTexts = Array.isArray(payload.imageTexts)
          ? payload.imageTexts.map((item) => String(item || '').trim()).filter(Boolean)
          : [];
        const lines = [
          title ? `# ${title}` : '',
          body,
          imageTexts.length > 0 ? '## 图片文案要点' : '',
          ...imageTexts.map((item, idx) => `${idx + 1}. ${item}`),
        ].filter(Boolean);

        const mergedText = lines.join('\n\n');
        if (target === 'infographic') {
          setActiveFeature('infographic');
          if (mergedText) setInfoContent(mergedText);
        } else {
          setActiveFeature('card-layout');
          if (mergedText) setCardMarkdown(mergedText);
        }
        setInjectedFromMyNote(true);
        Taro.removeStorageSync('MY_NOTE_REWRITE_PAYLOAD');
      }
    }
  });

  const cardPreviewPages = useMemo(() => {
    const pageMarkdown = paginatePreviewMarkdown(cardMarkdown, cardMaxPages, cardDensity, cardFontScale);
    return pageMarkdown.map((md) => renderMiniMarkdown(md));
  }, [cardDensity, cardFontScale, cardMarkdown, cardMaxPages]);

  useEffect(() => {
    if (cardPreviewPageIndex > cardPreviewPages.length - 1) {
      setCardPreviewPageIndex(0);
    }
  }, [cardPreviewPageIndex, cardPreviewPages.length]);

  const cardPreviewThemeClass = useMemo(() => {
    const bgClass = CARD_TEMPLATE_BG_CLASS_MAP[selectedCardStyle] || CARD_TEMPLATE_BG_CLASS_MAP['notion-style'];
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
    const fontClass = `preview-card--font-${cardFontFamily}`;
    return `${bgClass} ${radiusClass} ${colorClass} ${spacingClass} ${fontClass}`.trim();
  }, [cardFontFamily, cardHeadingSpacing, cardRadius, cardThemeColor, selectedCardStyle]);

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

  const handleBack = () => {
    const pages = Taro.getCurrentPages();
    if (pages.length > 1) {
      Taro.navigateBack({ delta: 1 });
      return;
    }
    Taro.switchTab({ url: '/pages/home/index' });
  };

  const handleChooseImages = async () => {
    try {
      const result = await Taro.chooseImage({
        count: Math.max(1, 9 - refImages.length),
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
      });
      const next = [...refImages, ...(result.tempFilePaths || [])].slice(0, 9);
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
      setCardMarkdown((prev) => (prev ? `${prev}\n${text}` : text));
      Taro.showToast({ title: '已粘贴', icon: 'success' });
    } catch {
      Taro.showToast({ title: '粘贴失败', icon: 'none' });
    }
  };

  const handleCreateAiImage = async () => {
    if (!aiPrompt.trim()) {
      Taro.showToast({ title: '请先填写图片描述', icon: 'none' });
      return;
    }
    if (aiSubmitting) return;

    setAiSubmitting(true);
    try {
      const remoteImages = refImages.filter((item) => /^https?:\/\//i.test(item));
      const localImages = refImages.filter((item) => !/^https?:\/\//i.test(item));

      const uploadedLocalImages = await Promise.all(
        localImages.slice(0, 5).map((path, idx) =>
          api.uploadMedia(path, `image2-ref-${Date.now()}-${idx + 1}.jpg`, 'image/jpeg'),
        ),
      );
      const imagePayload = [...remoteImages, ...uploadedLocalImages].slice(0, 5);

      const result = await miniappApi.generateCanvasImages({
        prompt: aiPrompt.trim(),
        model: selectedModel,
        size: '1024x1024',
        n: 1,
        image: imagePayload,
      });

      if (result.images.length > 0) {
        Taro.setStorageSync('IMAGE_GEN_LAST_RESULT', result.images);
        Taro.showToast({ title: `生成成功 ${result.images.length} 张`, icon: 'success' });
      } else {
        Taro.showToast({ title: '任务已提交，请稍后查看结果', icon: 'none' });
      }
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : 'AI作图失败',
        icon: 'none',
      });
    } finally {
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

      const start = await miniappApi.startImageTextReplication({
        sourceTitle: `信息图-${pickedTemplate.title}`,
        sourceText: infoContent.trim(),
        sourceImages: [],
        sourcePlatform: 'miniapp',
      });

      const generated = await miniappApi.triggerImageTextReplicationGenerate(start.taskId, {
        stylePresetId: pickedTemplate.id,
        topicHint: pickedTemplate.title || '信息图',
      });

      Taro.setStorageSync('INFOGRAPHIC_LAST_TASK_ID', generated.taskId || start.taskId);
      Taro.showToast({ title: '信息图任务已提交', icon: 'success' });
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
    if (!cardMarkdown.trim()) {
      Taro.showToast({ title: '请先粘贴或输入内容', icon: 'none' });
      return;
    }
    if (cardSubmitting) return;

    setCardSubmitting(true);
    try {
      const normalized = await miniappApi.normalizeXhsMarkdown(cardMarkdown.trim());
      const normalizedMarkdown = normalized.standardizedMarkdown || normalized.markdown || cardMarkdown.trim();
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

      const scaleMarkdown = (source: string): string => {
        if (cardFontScale === 'md') return source;
        const lines = source.split('\n');
        if (cardFontScale === 'lg') {
          return lines
            .map((line) => {
              if (!line.startsWith('## ')) return line;
              return `# ${line.replace(/^##\s+/, '')}`;
            })
            .join('\n');
        }
        return lines
          .map((line) => {
            if (!line.startsWith('# ')) return line;
            return `## ${line.replace(/^#\s+/, '')}`;
          })
          .join('\n');
      };

      const renderMarkdown = scaleMarkdown(densifyMarkdown(normalizedMarkdown));
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

      const styleMapping: Record<CardStyleId, 'clean' | 'dark' | 'gradient'> = {
        'cinematic-film': 'dark',
        'starry-night': 'dark',
        polaroid: 'clean',
        'notion-style': 'clean',
        'elegant-book': 'clean',
        'ios-memo': 'gradient',
        'swiss-studio': 'clean',
        'minimalist-magazine': 'clean',
        'aura-gradient': 'gradient',
        'deep-night': 'dark',
        'pro-doc': 'clean',
        blank: 'clean',
      };
      const paletteMapping: Record<CardThemeColor, string> = {
        amber: 'warm',
        blue: 'ocean',
        green: 'forest',
        rose: 'rose',
      };

      const coverStyleTemplateMapping: Record<CardCoverStyleId, string> = {
        'image-focus': 'cinematic-film',
        'grid-paper': 'notion-style',
        'rounded-gray-note': 'polaroid',
        'pastel-purple-cat': 'aura-gradient',
        'warm-gray-dog': 'minimalist-magazine',
        'lined-notebook': 'pro-doc',
        'lime-question': 'ios-memo',
        'mint-splash': 'starry-night',
      };
      const styleKey = `${styleMapping[selectedCardStyle]}-${paletteMapping[cardThemeColor]}`;
      const templateId = cardIncludeCover
        ? coverStyleTemplateMapping[cardCoverStyleId]
        : selectedCardStyle;

      const cardStyleConfig = {
        style: selectedCardStyle,
        styleKey,
        templateId,
        color: cardThemeColor,
        radius: cardRadius,
        headingSpacing: cardHeadingSpacing,
        fontFamily: cardFontFamily,
        fontScale: cardFontScale,
        density: cardDensity,
        includeCover: cardIncludeCover,
        coverMode: cardCoverMode,
        coverStyleId: cardCoverStyleId,
        coverTitle: cardCoverTitle,
        coverSubtitle: cardCoverSubtitle,
        maxPages: cardMaxPages,
      };

      const renderResult = await miniappApi.renderXhsLayout({
        markdown: withCoverFrontmatter,
        styleKey,
        templateId,
        title: meta.title || '图文卡片',
        includeCover: cardIncludeCover,
        maxPages: cardMaxPages,
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

      setCardMarkdown(renderMarkdown);
      setCardPreviewImages(publishImages);
      Taro.setStorageSync('CARD_LAYOUT_PREVIEW_MD', renderMarkdown);
      Taro.setStorageSync('CARD_LAYOUT_PUBLISH_TEXT', output);
      Taro.setStorageSync('CARD_LAYOUT_PUBLISH_QRCODE', published.qrcode || '');
      Taro.setStorageSync('CARD_LAYOUT_LAST_TASK_ID', renderResult.taskId || '');
      Taro.setStorageSync('CARD_LAYOUT_STYLE_CONFIG', cardStyleConfig);

      if (published.qrcode) {
        Taro.showModal({
          title: '发布二维码已生成',
          content: '已完成规范化、出图和发布，请在弹窗后查看二维码链接。',
          cancelText: '关闭',
          confirmText: '复制二维码链接',
          success: (res) => {
            if (res.confirm) {
              Taro.setClipboardData({
                data: published.qrcode,
              });
            }
          },
        });
      } else {
        Taro.showToast({ title: '卡片已生成并发布', icon: 'success' });
      }

      if (renderResult.taskId) {
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

  const renderCardSettingsPanel = () => (
    <View className='card-settings-content'>
      {renderSectionTitle('style', '预设风格')}
      <ScrollView scrollX className='style-preset-scroll'>
        <View className='style-preset-list'>
          {CARD_LAYOUT_STYLES.map((item) => {
            const active = selectedCardStyle === item.id;
            return (
              <View
                key={item.id}
                className={`style-preset-card ${active ? 'style-preset-card--active' : ''}`}
                onClick={() => {
                  setSelectedCardStyle(item.id);
                  setCardPreviewImages([]);
                  if (!cardMarkdown.trim()) {
                    setCardMarkdown(item.defaultMarkdown);
                  }
                }}
              >
                <View className={`style-preset-thumb style-preset-thumb--${item.id}`}>
                  <Text className='style-preset-thumb-title'>{item.title}</Text>
                  <View className='style-preset-color-row'>
                    {item.colors.map((color, idx) => (
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

      {renderSectionTitle('style', '样式配置')}
      <View className='card-config-card'>
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
                      onClick={() => setCardCoverStyleId(item.id)}
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
            {cardCoverMode === 'custom' && (
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
              </View>
            )}
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
          <Text className='card-config-label'>字号大小</Text>
          <View className='card-config-chips'>
            {CARD_FONT_SCALE_OPTIONS.map((item) => (
              <View
                key={item.id}
                className={`tiny-chip ${cardFontScale === item.id ? 'tiny-chip--active' : ''}`}
                onClick={() => setCardFontScale(item.id)}
              >
                <Text className={`tiny-chip-text ${cardFontScale === item.id ? 'tiny-chip-text--active' : ''}`}>{item.title}</Text>
              </View>
            ))}
          </View>
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
          <Text className='card-config-label'>字体族</Text>
          <View className='card-config-chips'>
            {CARD_FONT_FAMILY_OPTIONS.map((item) => (
              <View
                key={item.id}
                className={`tiny-chip ${cardFontFamily === item.id ? 'tiny-chip--active' : ''}`}
                onClick={() => setCardFontFamily(item.id)}
              >
                <Text className={`tiny-chip-text ${cardFontFamily === item.id ? 'tiny-chip-text--active' : ''}`}>{item.title}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
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

  const fixedSubmitSub = activeFeature === 'ai-image'
    ? '预计扣除算力值 40'
    : activeFeature === 'infographic'
      ? '预计扣除算力值 20'
      : '实时预览已同步，点击后将云端生成并发布';

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

  return (
    <View className='image-gen-root'>
      <View className={`image-gen-page ${showFixedSubmit ? '' : 'image-gen-page--no-fixed-submit'}`}>
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
            {renderSectionTitle('upload', '添加参考图片')}
            <Text className='section-hint'>可上传多图做风格参考、换脸、商品图优化与广告图生成。</Text>
            <View className='image-grid'>
              {refImages.map((src, idx) => (
                <View key={`${src}-${idx}`} className='thumb-wrap'>
                  <Image className='thumb' src={src} mode='aspectFill' />
                  <View className='thumb-delete' onClick={() => setRefImages((prev) => prev.filter((_, i) => i !== idx))}>
                    <Text className='thumb-delete-text'>×</Text>
                  </View>
                </View>
              ))}
              {refImages.length < 9 && (
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

            {renderSectionTitle('prompt', '图片创意描述', (
              <Text className='quick-action' onClick={() => setAiPrompt('')}>清空</Text>
            ))}
            <Textarea
              className='textarea'
              value={aiPrompt}
              onInput={(e) => setAiPrompt(e.detail.value)}
              placeholder='请用一句话描述您的创意...'
              maxlength={800}
            />
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
                    <Image className='template-preview' src={tpl.preview} mode='aspectFill' />
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

            {renderSectionTitle('edit', '输入内容')}
            <View className='info-input-box'>
              <Textarea
                className='textarea textarea--info'
                value={infoContent}
                onInput={(e) => setInfoContent(e.detail.value)}
                placeholder='输入或粘贴文案，系统会按所选模板排版成信息图。'
                maxlength={1200}
              />
              <View className='info-input-actions'>
                <View className='input-action-btn' onClick={handleFindInspiration}>
                  <Text className='input-action-btn-text'>没有文案？去找灵感</Text>
                </View>
                <View className='input-action-btn input-action-btn--ghost' onClick={handlePasteInfoContent}>
                  <Text className='input-action-btn-text input-action-btn-text--ghost'>粘贴</Text>
                </View>
              </View>
            </View>
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
            <View className='card-setting-trigger' onClick={() => setCardSettingsOpen((prev) => !prev)}>
              <Text className='card-setting-trigger-text'>{cardSettingsOpen ? '关闭设置' : '设置'}</Text>
            </View>
          </View>

            {cardEditorMode === 'edit' && (
              <>
                {renderSectionTitle('markdown', '粘贴 Markdown / 文案')}
                <View className='info-input-box info-input-box--card-editor'>
                  <Textarea
                    className='textarea textarea--info textarea--card-editor'
                    value={cardMarkdown}
                    onInput={(e) => setCardMarkdown(e.detail.value)}
                    placeholder='粘贴网页端的小红书 Markdown，自动转卡片布局。'
                    maxlength={2400}
                  />
                  <View className='info-input-actions'>
                    <View className='input-action-btn' onClick={handleFindInspiration}>
                      <Text className='input-action-btn-text'>没有文案？去找灵感</Text>
                    </View>
                    <View className='input-action-btn input-action-btn--ghost' onClick={handlePasteCardMarkdown}>
                      <Text className='input-action-btn-text input-action-btn-text--ghost'>粘贴</Text>
                    </View>
                  </View>
                </View>
              </>
            )}

            {cardEditorMode === 'preview' && (
              <>
                {renderSectionTitle('preview', '排版预览')}
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
                          <View className={`preview-card ${cardPreviewThemeClass}`}>
                            <RichText className='preview-richtext' nodes={html} />
                          </View>
                        </View>
                      </SwiperItem>
                    ))}
                  </Swiper>
                  <View className='preview-swiper-indicator'>
                    <Text className='preview-swiper-indicator-text'>{cardPreviewPageIndex + 1}/{cardPreviewPages.length}</Text>
                  </View>
                </View>
              </>
            )}
            {cardPreviewImages.length > 0 && (
              <ScrollView scrollX className='card-preview-image-scroll'>
                <View className='card-preview-image-list'>
                  {cardPreviewImages.map((url, idx) => (
                    <Image key={`${url}-${idx}`} className='card-preview-image' src={url} mode='aspectFill' />
                  ))}
                </View>
              </ScrollView>
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
          <Text className='image-gen-fixed-sub'>{fixedSubmitSub}</Text>
          <View className={`cta-btn ${fixedSubmitting ? 'cta-btn--disabled' : ''}`} onClick={handleFixedSubmit}>
            <Text className='cta-btn-text'>{fixedSubmitLabel}</Text>
          </View>
        </View>
      )}
    </View>
  );
}
