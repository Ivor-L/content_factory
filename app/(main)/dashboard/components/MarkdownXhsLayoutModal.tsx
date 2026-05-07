"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import { WandSparkles, X } from "lucide-react";
import { DownloadSimple, SpinnerGap } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTranslation } from "@/hooks/useTranslation";
import { splitMarkdownDocument, type MarkdownFrontmatterValue } from "@/lib/markdown-frontmatter";
import { cn } from "@/lib/utils";
import {
  MD2CARD_COMMON_CSS,
  MD2CARD_DEFAULT_HTML,
  MD2CARD_THEMES,
  type Md2CardTheme,
} from "./Md2CardThemes";

type ExportFormat = "png" | "jpeg";
type BgMode = "solid" | "gradient";
type CoverStyleId =
  | "image-focus"
  | "grid-paper"
  | "rounded-gray-note"
  | "pastel-purple-cat"
  | "warm-gray-dog"
  | "lined-notebook"
  | "lime-question"
  | "mint-splash";
type CardTemplateId =
  | "cinematic-film"
  | "starry-night"
  | "polaroid"
  | "notion-style"
  | "elegant-book"
  | "ios-memo"
  | "swiss-studio"
  | "minimalist-magazine"
  | "aura-gradient"
  | "deep-night"
  | "pro-doc"
  | "blank";
type CardStyleId =
  | "apple-notes"
  | "instagram"
  | "coil-notebook"
  | "pop-art"
  | "bytedance"
  | "alibaba"
  | "art-deco"
  | "glassmorphism"
  | "warm"
  | "minimal"
  | "minimalist"
  | "dreamy"
  | "nature"
  | "xiaohongshu"
  | "notebook"
  | "business"
  | "japanese-magazine"
  | "darktech"
  | "typewriter"
  | "watercolor"
  | "traditional-chinese"
  | "fairytale"
  | "cyberpunk"
  | "meadow-dawn";
type CardStyleModeId = string;

type SocialIconId = "gongzhonghao" | "shipinhao" | "xiaohongshu" | "zhihu" | "douyin" | "bilibili";
type SocialIconPosition = "top-right" | "bottom-center";
type CoverTitleAlignX = "left" | "center" | "right";
type CoverTitleAlignY = "top" | "center" | "bottom";

type TextFlags = {
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  strike?: boolean;
  highlight?: boolean;
  link?: boolean;
};

type InlineChunk = {
  text: string;
  flags: TextFlags;
};

type BlockKind = "heading1" | "heading2" | "heading3" | "heading4" | "paragraph" | "list" | "quote" | "code" | "table" | "hr";

type TextBlockKind = Exclude<BlockKind, "hr" | "table">;

type ParsedTableRow = {
  cells: InlineChunk[][];
  header: boolean;
};

type ParsedTextBlock = {
  kind: TextBlockKind;
  chunks: InlineChunk[];
  indent: number;
};

type ParsedTableBlock = {
  kind: "table";
  rows: ParsedTableRow[];
  columnCount: number;
  indent: number;
};

type ParsedHrBlock = {
  kind: "hr";
};

type ParsedBlock = ParsedTextBlock | ParsedTableBlock | ParsedHrBlock;

type Typography = {
  fontSize: number;
  lineHeight: number;
  fontWeight: string;
  fontFamily: string;
  color: string;
  marginTop: number;
  marginBottom: number;
};

type ComputedChunkStyle = {
  fontSize: number;
  lineHeight: number;
  fontWeight: string;
  fontStyle: "normal" | "italic";
  fontFamily: string;
  color: string;
  highlightColor?: string;
  strike?: boolean;
  letterSpacing: number;
};

type RenderChunk = {
  text: string;
  style: ComputedChunkStyle;
};

type RenderLine = {
  chunks: RenderChunk[];
  height: number;
};

type LayoutTextBlock = {
  kind: TextBlockKind;
  lines: RenderLine[];
  indent: number;
  marginTop: number;
  marginBottom: number;
};

type LayoutTableRow = {
  cells: RenderLine[][];
  header: boolean;
  height: number;
};

type LayoutTableBlock = {
  kind: "table";
  rows: LayoutTableRow[];
  columnCount: number;
  columnWidth: number;
  indent: number;
  marginTop: number;
  marginBottom: number;
};

type LayoutBlock = LayoutTextBlock | LayoutTableBlock;

type PageTextLine = {
  kind: TextBlockKind;
  line: RenderLine;
  indent: number;
  marginTop: number;
  marginBottom: number;
};

type PageTableRow = {
  kind: "table";
  cells: RenderLine[][];
  header: boolean;
  rowHeight: number;
  columnCount: number;
  columnWidth: number;
  indent: number;
  marginTop: number;
  marginBottom: number;
};

type PageLine = PageTextLine | PageTableRow;

type CardPage =
  | { type: "cover" }
  | { type: "content"; lines: PageLine[]; markdown?: string };

type TemplateSpec = {
  id: CardTemplateId;
  nameZh: string;
  nameEn: string;
  descZh: string;
  descEn: string;
  defaultBgMode: BgMode;
  defaultBgColor: string;
  defaultGradientStart: string;
  defaultGradientEnd: string;
  defaultGradientAngle: number;
  defaultTextColor: string;
  defaultAccentColor: string;
};

type CardStyleMode = {
  id: CardStyleModeId;
  titleZh: string;
  titleEn: string;
  descZh: string;
  descEn: string;
  colors: string[];
  previewBackground: string;
  textColor: string;
  accentColor?: string;
  className?: string;
};

type CardStylePreset = {
  id: CardStyleId;
  titleZh: string;
  titleEn: string;
  descZh: string;
  descEn: string;
  colors: string[];
  previewBackground: string;
  textColor: string;
  accentColor: string;
  backendTemplateId: CardTemplateId;
  md2CardTheme?: Md2CardTheme;
  modes?: CardStyleMode[];
};

type LayoutMetrics = {
  x: number;
  y: number;
  width: number;
  bottom: number;
};

type CoverStyleSpec = {
  id: CoverStyleId;
  nameZh: string;
  nameEn: string;
  preview: string;
  defaultTextColor: string;
  defaultHighlightColor: string;
  highlightStyle: "line" | "circle" | "fill";
  defaultCardRadius: number;
  layout: "image" | "poster";
  stickerAsset?: string;
  stickerAssetSecondary?: string;
};

type CardConfig = {
  bgMode: BgMode;
  bgColor: string;
  gradientStart: string;
  gradientEnd: string;
  gradientAngle: number;
  textColor: string;
  accentColor: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  textPadding: number;
  fontFamily: string;
  h1Scale: number;
  h2Scale: number;
  h3Scale: number;
  hasWatermark: boolean;
  watermarkText: string;
  watermarkColor: string;
  hasSignature: boolean;
  signatureText: string;
  signatureColor: string;
  showGrid: boolean;
  showPageNumber: boolean;
  hasCover: boolean;
  coverStyleId: CoverStyleId;
  coverTitle: string;
  coverSubtitle: string;
  coverImage: string;
  coverTextColor: string;
  coverHighlightColor: string;
  coverCardRadius: number;
  coverShowStickers: boolean;
  coverFontFamily: string;
  coverTitleAlignX: CoverTitleAlignX;
  coverTitleAlignY: CoverTitleAlignY;
  coverFontSize: number;
  coverSubtitleFontSize: number;
  coverLineHeight: number;
  hasSocialIcons: boolean;
  selectedSocialIcons: SocialIconId[];
  socialIconPosition: SocialIconPosition;
};

const CARD_WIDTH = 1242;
const CARD_HEIGHT = 1656;
const BASE_TEXT_PADDING = 40;
const MD2CARD_PREVIEW_WIDTH = 340;
const MD2CARD_PREVIEW_HEIGHT = (MD2CARD_PREVIEW_WIDTH * 4) / 3;
const MD2CARD_EXPORT_WIDTH = 900;
const MD2CARD_EXPORT_HEIGHT = 1200;
const MD2CARD_COIL_BG_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAJAAAACECAYAAAB/AaI1AAAACXBIWXMAACxLAAAsSwGlPZapAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAX+SURBVHgB7d07TxtpFMbxY6CByotoKECDKCnCdgtNHAkE3W7gA4TtEeEqIVFAakDBnwCngyq4AxocIVEA0rIS0Fk7Ky4l61Qgcdk9xx5HXscQ8AHPnPHzk0Y2JhcI/7zzzsUzkX8ZAZSphgAUEBCoICBQQUCggoBABQGBCgICFQQEKggIVBAQqCAgUEFAoIKAQAUBgQoCAhUEBCoICFQQEKggIFBBQKCCgEAFAYEKAgIVBAQqCAhUEBCoICBQQUCggoBABQGBCgICFQQEKggIVBAQqCAgUEFAoIKAQAUBgQoCAhUEBCoICFQQEKggIFBBQKCCgEAFAYEKAgIVBAQqCAhUEBCoICBQQUCgUkdV4vLykq6uruji4iL7XJZSotFopr6+nhobGzMNDQ0OwYMiYbxrczqdpvPz8+xydnaWjUbieapIJHLQ0tISbW9vz3R0dJDjOFF+2SH4JjQBSTSHh4e0t7dXViyP5La1tWUGBgbc5ubmTkJM9gOS0WV1dTUbUIWl+vr6qLe3V57HqEqZDmh7e5s2NjZecsR5DJdDcjkkh6pwRDIb0ObmZnYpQ4bnNi5/2wf8+Le8IB/L4+3tbbSmpibKn4vya6/4JXne+cg/NzE8PPyV50nv5PdRlTAZ0BPjyfCyxmF8ub6+Ti0tLbn0BKOjo9G6urpO/mf6jaN6/YOgMq2trZ9GRkYkvhhVAXMBPTKeDAeT4m8tvrCwkKJnxEE5/GdLTO/pnlUWf25pZmYmwrsE3lPImQpof3+fVlZWHvolsnqK39zc8ECzlKEXNj4+PsR/3yyVDsnlVVqSV2mhjshUQBKPRHSPOM9h5ioRTrEHQnIHBwfHurq6limk8yITAcleY9nHk0wmv9vi4h9cikecMQ7ngHw2OTk5x/+cs0UvhzoiEwEtLy/T0dFRqU/FFxcXRylAZI5UW1u7Rf8fjdzp6el4U1PTRwqZyO7ubqADksMRsr+niMx13j73BPm5yJYbRzTHTwvnPyn+epP8GKqIIhMTE9Y2412e67x56ua4H4pXabJ1Nj8//xM/fUchYe10DjPxCB5x5jiaD/mPOaZR/trX+KlLIWEpIFPx5BVHdHp6+vHk5GSMQsJKQCbjySuKyOHvQ/Zmr1EIRKampoYo4Mo5BBFEPCfa4tVYjJ9menp63vb3938m45v2EYKK8bbO/qDcJn6CRyY5mDtLhuGc6AqSveS8Kvvd+3BofX09QcbVElTUzs6O293dLZvyv6TT6a9yUhoZPo8II5AP5Jgd5XaGyo7GD2QYAvKBtyqL89Mob8TISxU/APxcEJBP5JQTfsjIiWr8+ImMQkA+KRiF5LBGioxCQD7yRqFoIpFwySgE5CNvFEodHx/LnmmXDEJAPru7u0vyIgF9IYMQkM84ngRPpB3CCATlkNUYH96Qc7JcMggBBQCPQH+S0X1BCCgAeDUm8SAgKE/+rdUWIaAA4GNjvr8lqVwIKBjMHgvDCWUB4Z2puEXGYAQKDocMQkDB4ZBBCCg4XpFBCCg4HDIIk+gAkEvq8cM/ZBBGoGCIkVEIKBh+JaMQUDDEyCgE5DNvB6JDRiEg/5m+VhC2wnzknYn4FxmGEchfpi+sIDAC+SQMo4/ACOQf86OPwAjkA+/tzJ8pBBBQhXmrruLrSJuFVVjl3XdvDZPq+H/EMgVfXO5fSsZ514weohCxcrMVOWf4Z8vvXgjTvKeQpbv1uJSLyNwJ6N5N6mTeE7qbrViaAzlk8D4TYY5HWJtED5W4nVJg8dcqx7nksr6hvYeqxa2wOe8HE2he6AkKOat3bZZ50Jsgbpl5+3lkyzZGVcDqfiBZJeRvGxAY/PXIZXtllRWjKmF5R2I+It/nRBIyLzJRzl7zkKqI1VVYMZdyqzSXKsgbASXgGFWpsASUl6LcNZfXXmp/kRfNa17kXq1VNdqUEraACqUod+FKmWi75U64vUlxjHLvHJW9yQ7BN2EOqBSXcltwhUspTsECD6i2gOCZ4XQOUEFAoIKAQAUBgQoCAhUEBCoICFQQEKggIFBBQKCCgEAFAYHKf5VuX5Rq+u6hAAAAAElFTkSuQmCC";

const FONT_OPTIONS = [
  { labelZh: "苹方 / 系统默认", labelEn: "System / PingFang", value: "'SF Pro Text', 'PingFang SC', -apple-system, BlinkMacSystemFont, sans-serif" },
  { labelZh: "思源黑体", labelEn: "Noto Sans SC", value: "'Noto Sans SC', 'PingFang SC', sans-serif" },
  { labelZh: "思源宋体", labelEn: "Noto Serif SC", value: "'Noto Serif SC', 'PingFang SC', serif" },
  { labelZh: "霞鹜文楷", labelEn: "LXGW WenKai", value: "'LXGW WenKai Screen', 'PingFang SC', serif" },
  { labelZh: "等宽（代码）", labelEn: "Monospace", value: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" },
] as const;

const COVER_FONT_OPTIONS = [
  { labelZh: "封面黑体（默认）", labelEn: "Cover Sans (Default)", value: "'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif" },
  { labelZh: "粗体标题", labelEn: "Heavy Title", value: "'Source Han Sans SC', 'Noto Sans SC', 'PingFang SC', sans-serif" },
  { labelZh: "海报宋体", labelEn: "Poster Serif", value: "'Source Han Serif SC', 'Noto Serif SC', 'STSong', serif" },
  { labelZh: "手写标题", labelEn: "Handwriting", value: "'LXGW WenKai Screen', 'KaiTi', 'STKaiti', serif" },
  { labelZh: "圆润标题", labelEn: "Rounded", value: "'YouYuan', 'PingFang SC', 'Microsoft YaHei', sans-serif" },
] as const;

const SOCIAL_ICON_OPTIONS: Array<{ id: SocialIconId; labelZh: string; labelEn: string; src: string }> = [
  { id: "gongzhonghao", labelZh: "公众号", labelEn: "Official", src: "/textcard-icons/gongzhonghao.png" },
  { id: "shipinhao", labelZh: "视频号", labelEn: "Video", src: "/textcard-icons/shipinhao.png" },
  { id: "xiaohongshu", labelZh: "小红书", labelEn: "RED", src: "/textcard-icons/xiaohongshu.png" },
  { id: "zhihu", labelZh: "知乎", labelEn: "Zhihu", src: "/textcard-icons/zhihu.png" },
  { id: "douyin", labelZh: "抖音", labelEn: "Douyin", src: "/textcard-icons/douyin.png" },
  { id: "bilibili", labelZh: "Bilibili", labelEn: "Bilibili", src: "/textcard-icons/bilibili.png" },
];

const COVER_STYLE_SPECS: CoverStyleSpec[] = [
  {
    id: "image-focus",
    nameZh: "图像主视觉",
    nameEn: "Image Hero",
    preview: "linear-gradient(135deg,#3d2f26,#8b6a57 45%,#ccb18f)",
    defaultTextColor: "#f6efe3",
    defaultHighlightColor: "#ffb347",
    highlightStyle: "fill",
    defaultCardRadius: 0,
    layout: "image",
  },
  {
    id: "grid-paper",
    nameZh: "方格手账",
    nameEn: "Grid Paper",
    preview: "linear-gradient(135deg,#f5f5f3,#edf2f1)",
    defaultTextColor: "#111111",
    defaultHighlightColor: "#f89b2f",
    highlightStyle: "line",
    defaultCardRadius: 0,
    layout: "poster",
  },
  {
    id: "rounded-gray-note",
    nameZh: "圆角灰卡",
    nameEn: "Rounded Gray",
    preview: "linear-gradient(135deg,#f3f3f3,#dedede)",
    defaultTextColor: "#121212",
    defaultHighlightColor: "#ff7d87",
    highlightStyle: "fill",
    defaultCardRadius: 46,
    layout: "poster",
    stickerAsset: "/textcard-stickers/boom.png",
    stickerAssetSecondary: "/textcard-stickers/cat.png",
  },
  {
    id: "pastel-purple-cat",
    nameZh: "紫调猫咪",
    nameEn: "Purple Cat",
    preview: "linear-gradient(135deg,#d8d2ee,#c7bfe6)",
    defaultTextColor: "#27272f",
    defaultHighlightColor: "#9de8d5",
    highlightStyle: "line",
    defaultCardRadius: 0,
    layout: "poster",
    stickerAsset: "/textcard-stickers/cat.png",
  },
  {
    id: "warm-gray-dog",
    nameZh: "暖灰小狗",
    nameEn: "Warm Gray Dog",
    preview: "linear-gradient(135deg,#e6e4df,#d9d7d1)",
    defaultTextColor: "#2b2c33",
    defaultHighlightColor: "#e7b6ff",
    highlightStyle: "circle",
    defaultCardRadius: 0,
    layout: "poster",
    stickerAsset: "/textcard-stickers/dog.png",
    stickerAssetSecondary: "/textcard-stickers/boom.png",
  },
  {
    id: "lined-notebook",
    nameZh: "横线本",
    nameEn: "Lined Notebook",
    preview: "linear-gradient(135deg,#f8f8f8,#eceef2)",
    defaultTextColor: "#111111",
    defaultHighlightColor: "#9bea94",
    highlightStyle: "circle",
    defaultCardRadius: 0,
    layout: "poster",
  },
  {
    id: "lime-question",
    nameZh: "亮黄提问",
    nameEn: "Lime Question",
    preview: "linear-gradient(135deg,#e9ef97,#d9e66e)",
    defaultTextColor: "#2a2a2a",
    defaultHighlightColor: "#77eb7f",
    highlightStyle: "fill",
    defaultCardRadius: 42,
    layout: "poster",
    stickerAsset: "/textcard-stickers/boom.png",
  },
  {
    id: "mint-splash",
    nameZh: "薄荷气泡",
    nameEn: "Mint Splash",
    preview: "linear-gradient(135deg,#bde8ea,#92d8db)",
    defaultTextColor: "#172a2a",
    defaultHighlightColor: "#74f0a3",
    highlightStyle: "line",
    defaultCardRadius: 36,
    layout: "poster",
  },
];

const SOLID_BG_PRESETS = [
  "#ffffff", "#E8D5C4", "#B5C0D0", "#CCD3CA", "#F5E8DD", "#9290C3",
  "#7C9D96", "#1a1a1b", "#667eea", "#f472b6", "#22d3ee", "#0f172a",
];

const GRADIENT_PRESETS = [
  { start: "#f5f7fa", end: "#c3cfe2", angle: 135 },
  { start: "#a1c4fd", end: "#c2e9fb", angle: 135 },
  { start: "#ff9a9e", end: "#fecfef", angle: 135 },
  { start: "#e0c3fc", end: "#8ec5fc", angle: 135 },
  { start: "#fdfcfb", end: "#e2d1c3", angle: 135 },
  { start: "#cfd9df", end: "#e2ebf0", angle: 135 },
  { start: "#667eea", end: "#764ba2", angle: 135 },
  { start: "#f093fb", end: "#f5576c", angle: 135 },
  { start: "#4facfe", end: "#00f2fe", angle: 135 },
  { start: "#0f0c29", end: "#24243e", angle: 135 },
  { start: "#fa709a", end: "#fee140", angle: 135 },
  { start: "#a8edea", end: "#fed6e3", angle: 135 },
];

const TEXT_COLOR_PRESETS = [
  "#333333", "#000000", "#495057", "#1c7ed6", "#d6336c", "#37b24d", "#f08c00", "#ffffff",
];

const ACCENT_COLOR_PRESETS = [
  "#FF9500", "#FF2D55", "#007AFF", "#34C759", "#5856D6", "#00F5FF", "#FF4500", "#000000", "#fbbf24", "#f472b6",
];

const NOTE_META_KEYS = new Set([
  "title", "cover_title", "cover_title", "cover", "subtitle",
  "description", "desc", "summary", "excerpt",
  "type", "status", "platform", "category", "tags", "tag",
  "author", "date", "created", "updated", "source", "slug",
  "标题", "封面标题", "描述", "简介", "类型", "状态", "平台", "分类", "标签", "作者", "日期", "来源",
]);

const COVER_TITLE_META_KEYS = new Set([
  "cover_title",
  "covertitle",
  "cover",
  "封面标题",
  "封面",
]);

const CARD_SYSTEM_META_KEYS = new Set([
  "来源", "链接", "采集时间", "内容类型", "素材来源", "生成时间", "更新时间",
  "source", "link", "url", "collected", "content type", "generated at", "updated at",
]);

const CARD_SYSTEM_FOOTER_HEADING = /^(关联素材|相关素材|素材关联|references?|sources?)$/i;
const META_CALLOUT_START_RE = /^(?:[>|]\s*)?\[!meta\]\s*/i;
const META_CALLOUT_TITLE_RE = /^(?:[>|]\s*)?入库信息(?:\s*[（(].*[)）])?\s*$/i;
const META_CALLOUT_INFO_RE =
  /^(?:[>|]\s*)?(来源|平台|保存时间|采集时间|来源链接|source|platform|saved\s*at|url|link)\s*[:：]/i;
const META_CALLOUT_TRAIL_RE = /^(?:[>|]\s*)?<\s*备注录/i;

const TEMPLATE_SPECS: TemplateSpec[] = [
  {
    id: "cinematic-film",
    nameZh: "电影胶片",
    nameEn: "Cinematic Film",
    descZh: "暗场电影感，适合叙事与情绪长文。",
    descEn: "Dark film mood for narrative writing.",
    defaultBgMode: "solid",
    defaultBgColor: "#121211",
    defaultGradientStart: "#1a1a18",
    defaultGradientEnd: "#0f0f0e",
    defaultGradientAngle: 135,
    defaultTextColor: "#ece6dc",
    defaultAccentColor: "#d9c8a6",
  },
  {
    id: "starry-night",
    nameZh: "星光质感",
    nameEn: "Starry Night",
    descZh: "深蓝夜空颗粒质感，适合观点卡片。",
    descEn: "Night-sky texture for thought cards.",
    defaultBgMode: "gradient",
    defaultBgColor: "#102447",
    defaultGradientStart: "#0f1e3a",
    defaultGradientEnd: "#1f3d73",
    defaultGradientAngle: 145,
    defaultTextColor: "#d9e8ff",
    defaultAccentColor: "#ffd870",
  },
  {
    id: "polaroid",
    nameZh: "复古拍立得",
    nameEn: "Polaroid",
    descZh: "相纸留白布局，适合个人风格表达。",
    descEn: "Paper-like layout with vintage feel.",
    defaultBgMode: "solid",
    defaultBgColor: "#d7d2cc",
    defaultGradientStart: "#e4ddd3",
    defaultGradientEnd: "#cfc8bb",
    defaultGradientAngle: 135,
    defaultTextColor: "#3a2e24",
    defaultAccentColor: "#9b4d3a",
  },
  {
    id: "notion-style",
    nameZh: "效率笔记",
    nameEn: "Notion Style",
    descZh: "轻文档风格，适合教程和清单。",
    descEn: "Clean doc style for guides and lists.",
    defaultBgMode: "solid",
    defaultBgColor: "#f7f6f3",
    defaultGradientStart: "#f8f7f4",
    defaultGradientEnd: "#efede8",
    defaultGradientAngle: 180,
    defaultTextColor: "#37352f",
    defaultAccentColor: "#0f7b6c",
  },
  {
    id: "elegant-book",
    nameZh: "书籍内页",
    nameEn: "Elegant Book",
    descZh: "纸张书页观感，适合深度文字。",
    descEn: "Book-page style for long-form content.",
    defaultBgMode: "solid",
    defaultBgColor: "#fdfbf7",
    defaultGradientStart: "#fdfbf7",
    defaultGradientEnd: "#f4efe6",
    defaultGradientAngle: 180,
    defaultTextColor: "#2b2b2b",
    defaultAccentColor: "#8c3a3a",
  },
  {
    id: "ios-memo",
    nameZh: "苹果备忘录",
    nameEn: "iOS Memo",
    descZh: "黄纸便签观感，适合轻量知识卡。",
    descEn: "Yellow memo style for short notes.",
    defaultBgMode: "solid",
    defaultBgColor: "#fff9dd",
    defaultGradientStart: "#fff9dd",
    defaultGradientEnd: "#fef3c7",
    defaultGradientAngle: 180,
    defaultTextColor: "#3f3a2a",
    defaultAccentColor: "#c99500",
  },
  {
    id: "swiss-studio",
    nameZh: "苏黎世工作室",
    nameEn: "Swiss Studio",
    descZh: "瑞士栅格视觉，强调信息层级。",
    descEn: "Swiss-grid aesthetic for hierarchy.",
    defaultBgMode: "solid",
    defaultBgColor: "#ffffff",
    defaultGradientStart: "#ffffff",
    defaultGradientEnd: "#f7f7f7",
    defaultGradientAngle: 180,
    defaultTextColor: "#1f1f1f",
    defaultAccentColor: "#ff3b30",
  },
  {
    id: "minimalist-magazine",
    nameZh: "极简杂志",
    nameEn: "Minimalist Magazine",
    descZh: "杂志排版感，适合标题驱动内容。",
    descEn: "Magazine-inspired bold typography.",
    defaultBgMode: "solid",
    defaultBgColor: "#fcfcfb",
    defaultGradientStart: "#fcfcfb",
    defaultGradientEnd: "#f5f5f4",
    defaultGradientAngle: 180,
    defaultTextColor: "#1f1f1f",
    defaultAccentColor: "#111111",
  },
  {
    id: "aura-gradient",
    nameZh: "弥散极光",
    nameEn: "Aura Gradient",
    descZh: "柔和渐变氛围，适合情绪和观点表达。",
    descEn: "Soft aura gradients for storytelling.",
    defaultBgMode: "gradient",
    defaultBgColor: "#e6e9ff",
    defaultGradientStart: "#ffdff4",
    defaultGradientEnd: "#dfe7ff",
    defaultGradientAngle: 135,
    defaultTextColor: "#272143",
    defaultAccentColor: "#6f4ee6",
  },
  {
    id: "deep-night",
    nameZh: "暗夜深思",
    nameEn: "Deep Night",
    descZh: "暗色沉浸感，适合思辨型内容。",
    descEn: "Dark immersive style for deep ideas.",
    defaultBgMode: "gradient",
    defaultBgColor: "#101a34",
    defaultGradientStart: "#0b1020",
    defaultGradientEnd: "#101a34",
    defaultGradientAngle: 140,
    defaultTextColor: "#d9f2ff",
    defaultAccentColor: "#00d4ff",
  },
  {
    id: "pro-doc",
    nameZh: "大厂文档",
    nameEn: "Pro Doc",
    descZh: "专业文档风格，适合方案和流程。",
    descEn: "Professional docs style for specs.",
    defaultBgMode: "solid",
    defaultBgColor: "#f8fbff",
    defaultGradientStart: "#f8fbff",
    defaultGradientEnd: "#f3f6fb",
    defaultGradientAngle: 180,
    defaultTextColor: "#1f2937",
    defaultAccentColor: "#2563eb",
  },
  {
    id: "blank",
    nameZh: "空白模板",
    nameEn: "Blank",
    descZh: "无装饰白底，适合自定义极简输出。",
    descEn: "Pure blank background for custom use.",
    defaultBgMode: "solid",
    defaultBgColor: "#ffffff",
    defaultGradientStart: "#ffffff",
    defaultGradientEnd: "#f7f7f7",
    defaultGradientAngle: 180,
    defaultTextColor: "#1a1a1a",
    defaultAccentColor: "#1a1a1a",
  },
];

const TEMPLATE_INDEX = new Map(TEMPLATE_SPECS.map((it) => [it.id, it]));
const COVER_STYLE_INDEX = new Map(COVER_STYLE_SPECS.map((it) => [it.id, it]));
const SOCIAL_ICON_ID_SET = new Set<SocialIconId>(SOCIAL_ICON_OPTIONS.map((it) => it.id));

const XHS_RENDER_TEMPLATE_BY_ID: Record<string, CardTemplateId> = {
  "apple-notes": "ios-memo",
  instagram: "aura-gradient",
  "coil-notebook": "notion-style",
  "pop-art": "aura-gradient",
  bytedance: "pro-doc",
  alibaba: "pro-doc",
  "art-deco": "deep-night",
  glassmorphism: "deep-night",
  warm: "elegant-book",
  minimal: "swiss-studio",
  minimalist: "minimalist-magazine",
  dreamy: "aura-gradient",
  nature: "notion-style",
  xiaohongshu: "aura-gradient",
  notebook: "notion-style",
  business: "pro-doc",
  "japanese-magazine": "minimalist-magazine",
  darktech: "deep-night",
  typewriter: "elegant-book",
  watercolor: "aura-gradient",
  "traditional-chinese": "elegant-book",
  fairytale: "aura-gradient",
  cyberpunk: "deep-night",
  "meadow-dawn": "notion-style",
};

const CARD_LAYOUT_STYLES: CardStylePreset[] = MD2CARD_THEMES.map((theme) => {
  const colors = extractMd2CardThemeColors(theme);
  return {
    id: theme.id as CardStyleId,
    titleZh: theme.name,
    titleEn: theme.enName || theme.name,
    descZh: theme.enName || theme.name,
    descEn: theme.enName || theme.name,
    colors: colors.swatches,
    previewBackground: theme.modes?.[0]?.background || colors.previewBackground,
    textColor: colors.textColor,
    accentColor: colors.accentColor,
    backendTemplateId: XHS_RENDER_TEMPLATE_BY_ID[theme.id] ?? "aura-gradient",
    md2CardTheme: theme,
    modes: theme.modes?.map((mode) => ({
      id: mode.id,
      titleZh: mode.name,
      titleEn: mode.enName || mode.name,
      descZh: mode.enName || mode.name,
      descEn: mode.enName || mode.name,
      colors: extractColorSwatches(mode.background || theme.css),
      previewBackground: mode.background || colors.previewBackground,
      textColor: colors.textColor,
      accentColor: colors.accentColor,
      className: mode.className,
    })),
  };
});

const CARD_STYLE_INDEX = new Map<CardStyleId, CardStylePreset>(CARD_LAYOUT_STYLES.map((item) => [item.id, item]));

const TEXT_CARD_STORAGE_KEY = "codepilot:markdown-text-card:settings:v1";
const XHS_EDITOR_DRAFT_PREFIX = "codepilot:xhs-layout:editor-draft:v1:";

const DEFAULT_CONFIG: Omit<CardConfig, "bgMode" | "bgColor" | "gradientStart" | "gradientEnd" | "gradientAngle" | "textColor" | "accentColor"> = {
  fontSize: 40,
  lineHeight: 1.58,
  letterSpacing: 0,
  textPadding: 40,
  fontFamily: FONT_OPTIONS[0].value,
  h1Scale: 1.55,
  h2Scale: 1.35,
  h3Scale: 1.18,
  hasWatermark: false,
  watermarkText: "",
  watermarkColor: "rgba(0,0,0,0.1)",
  hasSignature: false,
  signatureText: "",
  signatureColor: "#666666",
  showGrid: false,
  showPageNumber: true,
  hasCover: false,
  coverStyleId: "image-focus",
  coverTitle: "",
  coverSubtitle: "",
  coverImage: "",
  coverTextColor: "#f6efe3",
  coverHighlightColor: "#ffb347",
  coverCardRadius: 0,
  coverShowStickers: true,
  coverFontFamily: COVER_FONT_OPTIONS[0].value,
  coverTitleAlignX: "center",
  coverTitleAlignY: "center",
  coverFontSize: 195,
  coverSubtitleFontSize: 96,
  coverLineHeight: 1.4,
  hasSocialIcons: false,
  selectedSocialIcons: [],
  socialIconPosition: "top-right",
};

interface MarkdownTextCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  markdown: string;
  filePath: string;
  rightPanel?: ReactNode;
  xhsPublishMeta?: {
    title?: string;
    body?: string;
    tags?: string[];
  };
}

let _markdownParser: MarkdownIt | null = null;

function markPlugin(md: MarkdownIt) {
  md.inline.ruler.before("emphasis", "mark", (state: any, silent: boolean) => {
    const start = state.pos;
    if (state.src.charCodeAt(start) !== 0x3d || state.src.charCodeAt(start + 1) !== 0x3d) {
      return false;
    }

    let match = start + 2;
    while ((match = state.src.indexOf("==", match)) !== -1) {
      if (match === start + 2) {
        match += 2;
        continue;
      }

      if (!silent) {
        const prevPos = state.pos;
        const prevMax = state.posMax;
        state.pos = start + 2;
        state.posMax = match;

        const tokenOpen = state.push("mark_open", "mark", 1);
        tokenOpen.markup = "==";
        state.md.inline.tokenize(state);
        const tokenClose = state.push("mark_close", "mark", -1);
        tokenClose.markup = "==";

        state.pos = prevPos;
        state.posMax = prevMax;
      }

      state.pos = match + 2;
      return true;
    }

    return false;
  });
}

function getMarkdownParser(): MarkdownIt {
  if (_markdownParser) return _markdownParser;
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    breaks: true,
    typographer: false,
  });
  markPlugin(md);
  _markdownParser = md;
  return md;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getDefaultTitle(filePath: string): string {
  const file = filePath.split("/").pop() || filePath;
  return file.replace(/\.[^.]+$/, "") || "Document";
}

function normalizeMetaKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
}

function frontmatterValueToText(value: MarkdownFrontmatterValue): string {
  if (Array.isArray(value)) return value.map((item) => String(item)).join(" ");
  if (value === null) return "";
  return String(value);
}

function sanitizeCoverTitleCandidate(raw: string): string {
  return raw
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/[*_`#>|]/g, "")
    .replace(/^\s*["“”'‘’]+|["“”'‘’]+\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

function extractCoverTitleFromFrontmatter(markdown: string): string {
  const { frontmatter } = splitMarkdownDocument(markdown ?? "");
  for (const entry of frontmatter) {
    if (!COVER_TITLE_META_KEYS.has(normalizeMetaKey(entry.key))) continue;
    const text = sanitizeCoverTitleCandidate(frontmatterValueToText(entry.value));
    if (text) return text;
  }
  return "";
}

function extractCoverTitleFromBodyMeta(body: string): string {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const probeEnd = Math.min(lines.length, 50);
  for (let i = 0; i < probeEnd; i += 1) {
    const line = lines[i].trim();
    if (!line) {
      if (i > 12) break;
      continue;
    }
    if (line.startsWith("#")) break;
    const match = line.match(/^[-*+>\s]*([A-Za-z\u4E00-\u9FFF_][\w\u4E00-\u9FFF\s-]{0,60})\s*[：:]\s*(.+)$/);
    if (!match) continue;
    if (!COVER_TITLE_META_KEYS.has(normalizeMetaKey(match[1]))) continue;
    const title = sanitizeCoverTitleCandidate(match[2]);
    if (title) return title;
  }
  return "";
}

function extractThemeSeedFromBody(body: string): string {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed || isHorizontalRuleLine(trimmed)) continue;
    const candidate = sanitizeCoverTitleCandidate(
      trimmed
        .replace(/^#{1,6}\s+/, "")
        .replace(/^[-*+]\s+/, "")
        .replace(/^\d+\.\s+/, "")
        .split(/[。！？!?]/)[0] || ""
    );
    if (candidate.length >= 4) return candidate;
  }
  return "";
}

function inferCoverHook(body: string): string {
  if (/(避坑|误区|踩雷|别再|不要)/.test(body)) return "避坑指南";
  if (/(步骤|流程|方法|教程|怎么做|如何|清单|模板|实操)/.test(body)) return "实操模板";
  if (/(对比|区别|选哪个|选择)/.test(body)) return "对比讲清";
  if (/(经验|复盘|案例|亲测)/.test(body)) return "经验复盘";
  return "一篇讲透";
}

function buildAutoCoverTitle(seed: string, body: string): string {
  const core = sanitizeCoverTitleCandidate(seed);
  if (!core) return "";
  if (/(指南|清单|模板|教程|复盘|讲透|攻略|方法)/.test(core)) return core;
  if (core.length <= 14) return `${core}\n${inferCoverHook(body)}`;
  return core;
}

function deriveCoverTitleFromMarkdown(markdown: string, fallbackTitle: string): string {
  const fromFrontmatter = extractCoverTitleFromFrontmatter(markdown);
  if (fromFrontmatter) return fromFrontmatter;
  const { body } = splitMarkdownDocument(markdown ?? "");
  const fromBodyMeta = extractCoverTitleFromBodyMeta(body);
  if (fromBodyMeta) return fromBodyMeta;
  const cleanedBody = preprocessMarkdownForCard(markdown ?? "");
  const seed = extractThemeSeedFromBody(cleanedBody) || sanitizeCoverTitleCandidate(fallbackTitle);
  return buildAutoCoverTitle(seed, cleanedBody);
}

function splitCoverTitleAndSubtitle(raw: string): { title: string; subtitle: string } {
  const lines = raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return { title: "", subtitle: "" };
  return {
    title: lines[0] || "",
    subtitle: lines.slice(1).join("\n"),
  };
}

function resolveCoverText(
  manualCoverTitle: string,
  manualCoverSubtitle: string,
  inferredCoverTitle: string,
  fallbackTitle: string
): { title: string; subtitle: string } {
  const manualTitle = manualCoverTitle.trim();
  const manualSubtitle = manualCoverSubtitle.trim();
  if (manualTitle) {
    const manualParts = splitCoverTitleAndSubtitle(manualTitle);
    return {
      title: manualParts.title || fallbackTitle.trim() || "Untitled",
      subtitle: manualSubtitle || manualParts.subtitle,
    };
  }
  const inferredParts = splitCoverTitleAndSubtitle(inferredCoverTitle);
  const fallback = fallbackTitle.trim() || "Untitled";
  return {
    title: inferredParts.title || fallback,
    subtitle: manualSubtitle || inferredParts.subtitle,
  };
}

function extractMetaKey(line: string): string | null {
  const normalized = line
    .trim()
    .replace(/^>+\s*/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .trim();
  const keyMatch = normalized.match(/^([A-Za-z\u4E00-\u9FFF_][\w\u4E00-\u9FFF\s-]{0,60})\s*[：:]\s*(.*)$/);
  if (!keyMatch) return null;
  return keyMatch[1].trim().toLowerCase();
}

function isHorizontalRuleLine(line: string): boolean {
  return /^(-{3,}|\*{3,}|_{3,})$/.test(line.trim());
}

function isSystemMetaLine(line: string): boolean {
  const key = extractMetaKey(line);
  if (!key) return false;
  return CARD_SYSTEM_META_KEYS.has(key);
}

function findSystemHeaderEnd(lines: string[], start: number): number {
  const probeEnd = Math.min(lines.length, start + 40);
  let cursor = start;
  let consumedSystem = false;

  while (cursor < probeEnd) {
    const trimmed = lines[cursor].trim();

    if (!trimmed || trimmed === ">" || trimmed === ">-") {
      cursor += 1;
      continue;
    }
    if (isHorizontalRuleLine(trimmed)) {
      consumedSystem = true;
      cursor += 1;
      continue;
    }
    if (isSystemMetaLine(trimmed)) {
      consumedSystem = true;
      cursor += 1;
      continue;
    }
    break;
  }

  return consumedSystem ? cursor : -1;
}

function preprocessMarkdownForCard(markdown: string): string {
  const { body } = splitMarkdownDocument(markdown ?? "");
  const normalized = body.replace(/\r\n/g, "\n");
  if (!normalized) return "";

  const lines = normalized.split("\n");
  let index = 0;

  // Strip leading note-property block like "title: ...", "platform: ...", "tags: ...".
  while (index < lines.length) {
    const trimmed = lines[index].trim();
    if (!trimmed) {
      index += 1;
      continue;
    }

    const keyMatch = trimmed.match(/^([A-Za-z\u4E00-\u9FFF_][\w\u4E00-\u9FFF-]{0,40})\s*[：:]\s*(.*)$/);
    if (!keyMatch) break;
    const key = keyMatch[1].toLowerCase();
    if (!NOTE_META_KEYS.has(key)) break;

    index += 1;
    if (key === "tags" || key === "tag" || key === "标签") {
      while (index < lines.length && lines[index].trim().match(/^[-*]\s+/)) {
        index += 1;
      }
    }
  }

  const headerEnd = findSystemHeaderEnd(lines, index);
  if (headerEnd !== -1) {
    index = headerEnd;
    while (index < lines.length && !lines[index].trim()) index += 1;
  }

  let contentLines = lines.slice(index);

  // Remove meta callout blocks like:
  // > [!meta] 入库信息...
  // | [!meta] 入库信息...
  // and their following source/platform/saved-at lines.
  const strippedMetaLines: string[] = [];
  for (let cursor = 0; cursor < contentLines.length; cursor += 1) {
    const line = contentLines[cursor] || "";
    const trimmed = line.trim();
    const bare = trimmed.replace(/^[>|]\s*/, "").trim();
    const looksLikeMetaStart = META_CALLOUT_START_RE.test(trimmed) || META_CALLOUT_TITLE_RE.test(trimmed);
    if (!looksLikeMetaStart) {
      strippedMetaLines.push(line);
      continue;
    }

    cursor += 1;
    while (cursor < contentLines.length) {
      const probeLine = contentLines[cursor] || "";
      const probeTrimmed = probeLine.trim();
      const probeBare = probeTrimmed.replace(/^[>|]\s*/, "").trim();
      if (!probeBare) {
        cursor += 1;
        continue;
      }
      if (
        META_CALLOUT_INFO_RE.test(probeTrimmed) ||
        META_CALLOUT_TRAIL_RE.test(probeTrimmed) ||
        /^https?:\/\//i.test(probeBare) ||
        /^[>|]/.test(probeTrimmed) ||
        /^[-._~:/?#[\]@!$&'()*+,;=%A-Za-z0-9]+$/.test(probeBare)
      ) {
        cursor += 1;
        continue;
      }
      cursor -= 1;
      break;
    }
  }
  contentLines = strippedMetaLines;
  const footerStart = contentLines.findIndex((line) => {
    const heading = line.trim().match(/^#{1,6}\s+(.+)$/);
    if (!heading) return false;
    return CARD_SYSTEM_FOOTER_HEADING.test(heading[1].trim());
  });
  if (footerStart !== -1) {
    contentLines = contentLines.slice(0, footerStart);
  }

  while (contentLines.length > 0 && !contentLines[contentLines.length - 1].trim()) {
    contentLines.pop();
  }
  while (contentLines.length > 0 && isHorizontalRuleLine(contentLines[contentLines.length - 1])) {
    contentLines.pop();
    while (contentLines.length > 0 && !contentLines[contentLines.length - 1].trim()) {
      contentLines.pop();
    }
  }

  return contentLines.join("\n");
}

function sanitizeXhsPublishBody(raw: string): string {
  const cleaned = preprocessMarkdownForCard(raw || "");
  return cleaned.replace(/\n{3,}/g, "\n\n").trim().slice(0, 1000);
}

function sanitizeFileName(input: string): string {
  return input
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80) || "text-card";
}

function normalizeTagText(raw: string): string {
  return raw
    .replace(/^#+/, "")
    .replace(/[，、]/g, ",")
    .replace(/\s+/g, "")
    .replace(/[^\w\u4E00-\u9FFF-]/g, "")
    .trim()
    .slice(0, 16);
}

function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of tags) {
    const normalized = normalizeTagText(tag);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function markdownToPlainText(markdown: string): string {
  return stripHtmlTagsPreservingBreaks(getMarkdownParser().render(markdown ?? ""))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncateXhsTitle(raw: string): string {
  return Array.from(raw.trim()).slice(0, 20).join("");
}

function parseTagsInput(raw: string): string[] {
  return raw
    .replace(/\r\n/g, "\n")
    .split(/[\n\s,，、]+/)
    .map((item) => item.trim().replace(/^#+/, ""))
    .filter(Boolean);
}

function formatTagsInput(tags: string[]): string {
  return tags
    .map((tag) => normalizeTagText(tag))
    .filter(Boolean)
    .map((tag) => `#${tag}`)
    .join(" ");
}

function getXhsEditorDraftKey(filePath: string): string {
  return `${XHS_EDITOR_DRAFT_PREFIX}${filePath || "untitled.md"}`;
}

function readXhsEditorDraft(filePath: string): { title: string; body: string; tagsText: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(getXhsEditorDraftKey(filePath));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      version?: number;
      title?: unknown;
      body?: unknown;
      tagsText?: unknown;
    };
    if (!parsed || parsed.version !== 1) return null;
    return {
      title: typeof parsed.title === "string" ? truncateXhsTitle(parsed.title) : "",
      body: typeof parsed.body === "string" ? sanitizeXhsPublishBody(parsed.body) : "",
      tagsText: typeof parsed.tagsText === "string" ? parsed.tagsText : "",
    };
  } catch {
    return null;
  }
}

function writeXhsEditorDraft(filePath: string, payload: { title: string; body: string; tagsText: string }) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      getXhsEditorDraftKey(filePath),
      JSON.stringify({
        version: 1,
        title: truncateXhsTitle(payload.title || ""),
        body: sanitizeXhsPublishBody(payload.body || ""),
        tagsText: payload.tagsText || "",
        updatedAt: Date.now(),
      })
    );
  } catch {
    // ignore localStorage failures
  }
}

function buildLocalMetaFallback(markdown: string, filePath: string): {
  title: string;
  body: string;
  tags: string[];
} {
  const fallbackTitle = getDefaultTitle(filePath || "untitled.md");
  const inferredTitle = deriveCoverTitleFromMarkdown(markdown, fallbackTitle).replace(/\n+/g, " ").trim();
  const plainBody = preprocessMarkdownForCard(markdown)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  const hashTags = Array.from(
    new Set(
      Array.from((markdown || "").matchAll(/#([A-Za-z0-9_\u4E00-\u9FFF-]{2,20})/g)).map((m) => m[1] || "")
    )
  );
  const extraSeed = (inferredTitle || fallbackTitle)
    .replace(/[：:，,。！？!?]/g, " ")
    .split(/\s+/)
    .map((item) => normalizeTagText(item))
    .filter(Boolean);
  const next = {
    title: truncateXhsTitle(inferredTitle || fallbackTitle),
    body: plainBody.length > 520 ? `${plainBody.slice(0, 520).trim()}...` : plainBody,
    tags: dedupeTags([...hashTags, ...extraSeed, "小红书图文", "内容排版"]).slice(0, 8),
  };
  return {
    title: truncateXhsTitle(next.title || getDefaultTitle(filePath || "untitled.md")),
    body: (next.body || "").slice(0, 1000),
    tags: dedupeTags(Array.isArray(next.tags) ? next.tags : []).slice(0, 8),
  };
}

function findTemplate(id: CardTemplateId): TemplateSpec {
  return TEMPLATE_INDEX.get(id) || TEMPLATE_SPECS[0];
}

function findCardStyle(id: CardStyleId): CardStylePreset {
  return CARD_STYLE_INDEX.get(id) || CARD_LAYOUT_STYLES[0];
}

function getFirstCardStyleMode(style: CardStylePreset): CardStyleMode | null {
  return style.modes?.[0] || null;
}

function getCardStyleMode(style: CardStylePreset, modeId: CardStyleModeId): CardStyleMode | null {
  if (!style.modes || style.modes.length === 0) return null;
  return style.modes.find((mode) => mode.id === modeId) || style.modes[0] || null;
}

function parseLinearGradientPreset(background: string): {
  bgMode: BgMode;
  bgColor: string;
  gradientStart: string;
  gradientEnd: string;
  gradientAngle: number;
} {
  const value = background.trim();
  const gradientMatch = value.match(/linear-gradient\(\s*([0-9.]+)deg\s*,\s*(#[0-9a-fA-F]{3,8})[^,]*,\s*(#[0-9a-fA-F]{3,8})/);
  if (gradientMatch) {
    return {
      bgMode: "gradient",
      bgColor: gradientMatch[2],
      gradientStart: gradientMatch[2],
      gradientEnd: gradientMatch[3],
      gradientAngle: Math.round(Number(gradientMatch[1])) || 180,
    };
  }
  const colors = Array.from(value.matchAll(/#[0-9a-fA-F]{3,8}/g)).map((match) => match[0]);
  if (colors.length >= 2) {
    return {
      bgMode: "gradient",
      bgColor: colors[0],
      gradientStart: colors[0],
      gradientEnd: colors[1],
      gradientAngle: 135,
    };
  }
  return {
    bgMode: "solid",
    bgColor: colors[0] || "#ffffff",
    gradientStart: colors[0] || "#ffffff",
    gradientEnd: colors[1] || colors[0] || "#f5f5f5",
    gradientAngle: 180,
  };
}

function findCoverStyle(id: CoverStyleId): CoverStyleSpec {
  return COVER_STYLE_INDEX.get(id) || COVER_STYLE_SPECS[0];
}

function isCoilNotebookStyle(cardStyleId?: CardStyleId): boolean {
  return cardStyleId === "coil-notebook";
}

function getCoilNotebookRenderConfig(config: CardConfig): CardConfig {
  return {
    ...config,
    textColor: "#24292e",
    accentColor: "#24292e",
  };
}

function applyTemplateDefaults(previous: CardConfig, tpl: TemplateSpec): CardConfig {
  return {
    ...previous,
    bgMode: tpl.defaultBgMode,
    bgColor: tpl.defaultBgColor,
    gradientStart: tpl.defaultGradientStart,
    gradientEnd: tpl.defaultGradientEnd,
    gradientAngle: tpl.defaultGradientAngle,
    textColor: tpl.defaultTextColor,
    accentColor: tpl.defaultAccentColor,
  };
}

function applyCardStyleDefaults(previous: CardConfig, style: CardStylePreset, mode: CardStyleMode | null): CardConfig {
  const background = parseLinearGradientPreset(mode?.previewBackground || style.previewBackground);
  const textColor = mode?.textColor || style.textColor;
  const accentColor = mode?.accentColor || style.accentColor;
  if (style.id === "coil-notebook") {
    const modeColor = mode?.colors?.[0] || style.colors[0] || background.bgColor;
    return {
      ...previous,
      bgMode: "solid",
      bgColor: modeColor,
      gradientStart: modeColor,
      gradientEnd: mode?.colors?.[1] || style.colors[1] || modeColor,
      gradientAngle: 180,
      textColor: "#24292e",
      accentColor: "#24292e",
      fontSize: 52,
      lineHeight: 1.5,
      letterSpacing: 0,
      textPadding: 40,
      h1Scale: 1.35,
      h2Scale: 1.18,
      h3Scale: 1.08,
    };
  }
  return {
    ...previous,
    ...background,
    textColor,
    accentColor,
    fontSize: 40,
    lineHeight: 1.58,
    letterSpacing: 0,
    textPadding: style.id === "minimalist" || style.id === "japanese-magazine" ? 34 : 40,
    h1Scale: style.id === "minimalist" || style.id === "pop-art" ? 1.72 : 1.55,
    h2Scale: 1.35,
    h3Scale: 1.18,
  };
}

function applyCoverStyleDefaults(previous: CardConfig, style: CoverStyleSpec): CardConfig {
  return {
    ...previous,
    coverStyleId: style.id,
    coverTextColor: style.defaultTextColor,
    coverHighlightColor: style.defaultHighlightColor,
    coverCardRadius: style.defaultCardRadius,
    coverShowStickers: Boolean(style.stickerAsset || style.stickerAssetSecondary),
    coverFontFamily: previous.coverFontFamily || COVER_FONT_OPTIONS[0].value,
  };
}

function createInitialConfig(templateId: CardTemplateId): CardConfig {
  const tpl = findTemplate(templateId);
  return applyCoverStyleDefaults(
    applyTemplateDefaults(
      {
        ...DEFAULT_CONFIG,
        bgMode: "solid",
        bgColor: "#ffffff",
        gradientStart: "#ffffff",
        gradientEnd: "#f5f5f5",
        gradientAngle: 180,
        textColor: "#1a1a1a",
        accentColor: "#2563eb",
      },
      tpl
    ),
    findCoverStyle(DEFAULT_CONFIG.coverStyleId)
  );
}

function extractColorSwatches(source: string): string[] {
  const colors = Array.from(source.matchAll(/#[0-9a-fA-F]{6}/g)).map((match) => match[0]);
  return Array.from(new Set(colors)).slice(0, 3);
}

function extractMd2CardThemeColors(theme: Md2CardTheme): {
  bgMode: BgMode;
  bgColor: string;
  gradientStart: string;
  gradientEnd: string;
  textColor: string;
  accentColor: string;
  previewBackground: string;
  swatches: string[];
} {
  const css = theme.css;
  const modeBackground = theme.modes?.[0]?.background || "";
  const gradientMatch = (modeBackground || css).match(/linear-gradient\((?:[^()]|\([^)]*\))*\)/);
  const swatches = extractColorSwatches(`${modeBackground}\n${css}`);
  const bgColor = swatches[0] || "#ffffff";
  const textColor = swatches[1] || "#1f2937";
  const accentColor = swatches[2] || textColor;
  const gradientColors = gradientMatch?.[0].match(/#[0-9a-fA-F]{6}/g) || [];
  return {
    bgMode: gradientMatch ? "gradient" : "solid",
    bgColor,
    gradientStart: gradientColors[0] || bgColor,
    gradientEnd: gradientColors[gradientColors.length - 1] || bgColor,
    textColor,
    accentColor,
    previewBackground: modeBackground || gradientMatch?.[0] || bgColor,
    swatches: swatches.length > 0 ? swatches : [bgColor, textColor, accentColor],
  };
}

type PersistedTextCardSettings = {
  version: 1;
  cardStyleId?: CardStyleId;
  cardStyleModeId?: CardStyleModeId;
  templateId: CardTemplateId;
  config: CardConfig;
  format: ExportFormat;
  previewScale: number;
  coverImageName?: string;
};

function normalizePersistedCardSettings(raw: string | null): PersistedTextCardSettings | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedTextCardSettings> & {
      config?: Partial<CardConfig>;
    };
    if (!parsed || parsed.version !== 1) return null;

    const persistedTemplate = parsed.templateId;
    if (!persistedTemplate || !TEMPLATE_INDEX.has(persistedTemplate)) return null;
    const persistedStyle =
      parsed.cardStyleId && CARD_STYLE_INDEX.has(parsed.cardStyleId)
        ? parsed.cardStyleId
        : CARD_LAYOUT_STYLES.find((style) => style.backendTemplateId === persistedTemplate)?.id || CARD_LAYOUT_STYLES[0].id;
    const stylePreset = findCardStyle(persistedStyle);
    const persistedStyleMode =
      typeof parsed.cardStyleModeId === "string" && stylePreset.modes?.some((mode) => mode.id === parsed.cardStyleModeId)
        ? parsed.cardStyleModeId
        : getFirstCardStyleMode(stylePreset)?.id || "";

    const base = createInitialConfig(persistedTemplate);
    const cfg: Partial<CardConfig> = parsed.config ?? {};
    const safeString = (value: unknown, fallback: string) =>
      typeof value === "string" && value.trim().length > 0 ? value : fallback;
    const safeNumber = (value: unknown, fallback: number, min: number, max: number) =>
      typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;

    const nextConfig: CardConfig = {
      ...base,
      bgMode: cfg.bgMode === "solid" || cfg.bgMode === "gradient" ? cfg.bgMode : base.bgMode,
      bgColor: safeString(cfg.bgColor, base.bgColor),
      gradientStart: safeString(cfg.gradientStart, base.gradientStart),
      gradientEnd: safeString(cfg.gradientEnd, base.gradientEnd),
      gradientAngle: safeNumber(cfg.gradientAngle, base.gradientAngle, 0, 360),
      textColor: safeString(cfg.textColor, base.textColor),
      accentColor: safeString(cfg.accentColor, base.accentColor),
      fontSize: safeNumber(cfg.fontSize, base.fontSize, 24, 56),
      lineHeight: safeNumber(cfg.lineHeight, base.lineHeight, 1.2, 2.2),
      letterSpacing: safeNumber(cfg.letterSpacing, base.letterSpacing, 0, 3),
      textPadding: safeNumber(cfg.textPadding, base.textPadding, 20, 80),
      fontFamily: safeString(cfg.fontFamily, base.fontFamily),
      h1Scale: safeNumber(cfg.h1Scale, base.h1Scale, 1, 3),
      h2Scale: safeNumber(cfg.h2Scale, base.h2Scale, 1, 2.5),
      h3Scale: safeNumber(cfg.h3Scale, base.h3Scale, 1, 2),
      hasWatermark: Boolean(cfg.hasWatermark),
      watermarkText: typeof cfg.watermarkText === "string" ? cfg.watermarkText : base.watermarkText,
      watermarkColor: safeString(cfg.watermarkColor, base.watermarkColor),
      hasSignature: Boolean(cfg.hasSignature),
      signatureText: typeof cfg.signatureText === "string" ? cfg.signatureText : base.signatureText,
      signatureColor: safeString(cfg.signatureColor, base.signatureColor),
      showGrid: Boolean(cfg.showGrid),
      showPageNumber: cfg.showPageNumber === undefined ? base.showPageNumber : Boolean(cfg.showPageNumber),
      hasCover: Boolean(cfg.hasCover),
      coverStyleId: cfg.coverStyleId && COVER_STYLE_INDEX.has(cfg.coverStyleId) ? cfg.coverStyleId : base.coverStyleId,
      coverTitle: typeof cfg.coverTitle === "string" ? cfg.coverTitle : base.coverTitle,
      coverSubtitle: typeof cfg.coverSubtitle === "string" ? cfg.coverSubtitle : base.coverSubtitle,
      coverImage: typeof cfg.coverImage === "string" ? cfg.coverImage : base.coverImage,
      coverTextColor: safeString(cfg.coverTextColor, base.coverTextColor),
      coverHighlightColor: safeString(cfg.coverHighlightColor, base.coverHighlightColor),
      coverCardRadius: safeNumber(cfg.coverCardRadius, base.coverCardRadius, 0, 64),
      coverShowStickers: cfg.coverShowStickers === undefined ? base.coverShowStickers : Boolean(cfg.coverShowStickers),
      coverFontFamily: safeString(cfg.coverFontFamily, base.coverFontFamily),
      coverTitleAlignX: cfg.coverTitleAlignX === "left" || cfg.coverTitleAlignX === "center" || cfg.coverTitleAlignX === "right"
        ? cfg.coverTitleAlignX
        : base.coverTitleAlignX,
      coverTitleAlignY: cfg.coverTitleAlignY === "top" || cfg.coverTitleAlignY === "center" || cfg.coverTitleAlignY === "bottom"
        ? cfg.coverTitleAlignY
        : base.coverTitleAlignY,
      coverFontSize: safeNumber(cfg.coverFontSize, base.coverFontSize, 28, 220),
      coverSubtitleFontSize: safeNumber(cfg.coverSubtitleFontSize, base.coverSubtitleFontSize, 22, 180),
      coverLineHeight: safeNumber(cfg.coverLineHeight, base.coverLineHeight, 1.1, 2),
      hasSocialIcons: Boolean(cfg.hasSocialIcons),
      selectedSocialIcons: Array.isArray(cfg.selectedSocialIcons)
        ? Array.from(new Set(cfg.selectedSocialIcons.filter((id): id is SocialIconId => SOCIAL_ICON_ID_SET.has(id)))).slice(0, 6)
        : base.selectedSocialIcons,
      socialIconPosition: cfg.socialIconPosition === "top-right" || cfg.socialIconPosition === "bottom-center"
        ? cfg.socialIconPosition
        : base.socialIconPosition,
    };

    const nextFormat: ExportFormat = parsed.format === "jpeg" ? "jpeg" : "png";
    const nextPreviewScale = safeNumber(parsed.previewScale, 100, 50, 150);
    const nextCoverImageName =
      typeof parsed.coverImageName === "string" && parsed.coverImageName.trim().length > 0
        ? parsed.coverImageName
        : "";

    return {
      version: 1,
      cardStyleId: persistedStyle,
      cardStyleModeId: persistedStyleMode,
      templateId: persistedTemplate,
      config: nextConfig,
      format: nextFormat,
      previewScale: nextPreviewScale,
      coverImageName: nextCoverImageName,
    };
  } catch {
    return null;
  }
}

function drawTitleMarkerStroke(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  rotateDeg = -3
) {
  ctx.save();
  ctx.translate(x + width / 2, y + height / 2);
  ctx.rotate((rotateDeg * Math.PI) / 180);
  drawRoundedRect(ctx, -width / 2, -height / 2, width, height, Math.min(18, height / 2), color);
  ctx.restore();
}

function drawTitleHighlightLine(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  thickness: number,
  color: string,
  rotateDeg = -3
) {
  const lineThickness = Math.max(8, thickness);
  const glossThickness = Math.max(3, lineThickness * 0.36);
  ctx.save();
  ctx.translate(x + width / 2, y + lineThickness / 2);
  ctx.rotate((rotateDeg * Math.PI) / 180);
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.globalAlpha = 0.95;
  ctx.lineWidth = lineThickness;
  ctx.beginPath();
  ctx.moveTo(-width / 2, 0);
  ctx.lineTo(width / 2, 0);
  ctx.stroke();
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = glossThickness;
  ctx.beginPath();
  ctx.moveTo(-width / 2 + 8, -lineThickness * 0.24);
  ctx.lineTo(width / 2 - 8, -lineThickness * 0.24);
  ctx.stroke();
  ctx.restore();
}

function drawTitleHighlightCircle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  rotateDeg = -2
) {
  const strokeW = Math.max(6, Math.min(22, height * 0.16));
  const ovalH = Math.max(54, height);
  const ovalW = Math.max(240, width);
  ctx.save();
  ctx.translate(x + ovalW / 2, y + ovalH / 2);
  ctx.rotate((rotateDeg * Math.PI) / 180);
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = 0.92;
  ctx.lineWidth = strokeW;
  ctx.beginPath();
  ctx.ellipse(0, 0, ovalW / 2, ovalH / 2, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = Math.max(3, strokeW * 0.5);
  ctx.beginPath();
  ctx.ellipse(10, -4, ovalW * 0.48, ovalH * 0.46, 0, 0, Math.PI * 1.98);
  ctx.stroke();
  ctx.restore();
}

function drawTitleHighlight(
  ctx: CanvasRenderingContext2D,
  highlightStyle: CoverStyleSpec["highlightStyle"],
  x: number,
  y: number,
  width: number,
  fontSize: number,
  lineHeightPx: number,
  color: string
) {
  if (highlightStyle === "circle") {
    drawTitleHighlightCircle(ctx, x, y + fontSize * 0.08, width, Math.max(fontSize * 0.92, lineHeightPx * 0.85), color, -2);
    return;
  }
  if (highlightStyle === "line") {
    drawTitleHighlightLine(ctx, x, y + fontSize * 0.9, width, Math.max(10, fontSize * 0.2), color, -4);
    return;
  }
  drawTitleMarkerStroke(ctx, x, y + fontSize * 0.74, width, Math.max(22, fontSize * 0.24), color, -4);
}

function wrapCoverTitleLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: string,
  maxWidth: number
): string[] {
  const rawLines = text.replace(/\r\n/g, "\n").split("\n");
  const lines: string[] = [];
  ctx.font = font;

  for (const row of rawLines) {
    const line = row.trim();
    if (!line) continue;
    let buffer = "";
    for (const char of Array.from(line)) {
      const next = `${buffer}${char}`;
      if (ctx.measureText(next).width > maxWidth && buffer) {
        lines.push(buffer);
        buffer = char;
      } else {
        buffer = next;
      }
    }
    if (buffer) lines.push(buffer);
  }
  return lines.length > 0 ? lines : ["Untitled"];
}

function drawGridPaperBackground(ctx: CanvasRenderingContext2D, color = "#f7f8f6") {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  ctx.strokeStyle = "rgba(76,127,120,0.17)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= CARD_WIDTH; x += 42) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, CARD_HEIGHT);
    ctx.stroke();
  }
  for (let y = 0; y <= CARD_HEIGHT; y += 42) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CARD_WIDTH, y);
    ctx.stroke();
  }
}

function drawNotebookBackground(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#f6f7f9";
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  ctx.strokeStyle = "rgba(103,111,141,0.2)";
  ctx.lineWidth = 2;
  for (let y = 80; y <= CARD_HEIGHT; y += 56) {
    ctx.beginPath();
    ctx.moveTo(44, y);
    ctx.lineTo(CARD_WIDTH - 44, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(173,86,86,0.22)";
  ctx.beginPath();
  ctx.moveTo(86, 0);
  ctx.lineTo(86, CARD_HEIGHT);
  ctx.stroke();
}

function drawPosterCover(
  ctx: CanvasRenderingContext2D,
  style: CoverStyleSpec,
  title: string,
  subtitle: string,
  config: CardConfig,
  stickerImages: Partial<Record<CoverStyleId, { primary: HTMLImageElement | null; secondary: HTMLImageElement | null }>>
) {
  if (style.id === "grid-paper") drawGridPaperBackground(ctx);
  else if (style.id === "lined-notebook") drawNotebookBackground(ctx);
  else if (style.id === "rounded-gray-note") {
    ctx.fillStyle = "#dddddd";
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
    drawRoundedRect(
      ctx,
      34,
      40,
      CARD_WIDTH - 68,
      CARD_HEIGHT - 80,
      Math.max(20, config.coverCardRadius),
      "#ececec",
      "rgba(0,0,0,0.06)"
    );
  } else if (style.id === "pastel-purple-cat") {
    ctx.fillStyle = "#d9d3ef";
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  } else if (style.id === "warm-gray-dog") {
    ctx.fillStyle = "#e9e7e2";
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  } else if (style.id === "lime-question") {
    ctx.fillStyle = "#edf29c";
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
    drawRoundedRect(
      ctx,
      44,
      116,
      CARD_WIDTH - 88,
      CARD_HEIGHT - 236,
      Math.max(24, config.coverCardRadius),
      "rgba(236,242,133,0.96)"
    );
  } else if (style.id === "mint-splash") {
    const grad = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
    grad.addColorStop(0, "#bde8ea");
    grad.addColorStop(1, "#8ed6d9");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  }

  const coverTitle = title.trim() || "Untitled";
  const coverSubtitle = subtitle.trim();
  const titleFont = `900 ${config.coverFontSize}px ${config.coverFontFamily || config.fontFamily}`;
  const subtitleFont = `700 ${config.coverSubtitleFontSize}px ${config.coverFontFamily || config.fontFamily}`;
  const titleLines = wrapCoverTitleLines(ctx, coverTitle, titleFont, CARD_WIDTH - 220);
  const subtitleLines = coverSubtitle
    ? wrapCoverTitleLines(ctx, coverSubtitle, subtitleFont, CARD_WIDTH - 240).slice(0, 3)
    : [];
  const titleLineHeightPx = config.coverFontSize * config.coverLineHeight;
  const subtitleLineHeightPx = config.coverSubtitleFontSize * Math.max(1.15, config.coverLineHeight - 0.16);
  const subtitleGap = subtitleLines.length > 0 ? Math.max(18, config.coverSubtitleFontSize * 0.36) : 0;
  const horizontalPadding = 128;
  ctx.font = titleFont;
  const titleMaxWidth = Math.max(80, ...titleLines.map((line) => ctx.measureText(line).width));
  ctx.font = subtitleFont;
  const subtitleMaxWidth = subtitleLines.length > 0
    ? Math.max(60, ...subtitleLines.map((line) => ctx.measureText(line).width))
    : 0;
  const maxLineWidth = Math.max(titleMaxWidth, subtitleMaxWidth);
  const availableTop = style.id === "lime-question" ? 220 : 190;
  const availableBottom = CARD_HEIGHT - 280;
  const textBlockHeight =
    titleLines.length * titleLineHeightPx
    + subtitleGap
    + subtitleLines.length * subtitleLineHeightPx;
  const yRange = Math.max(0, availableBottom - availableTop - textBlockHeight);
  const startY =
    config.coverTitleAlignY === "top"
      ? availableTop
      : config.coverTitleAlignY === "bottom"
        ? availableTop + yRange
        : availableTop + yRange / 2;

  const centerX = CARD_WIDTH / 2;
  const rightX = CARD_WIDTH - horizontalPadding;
  const leftX = horizontalPadding;
  const alignX = config.coverTitleAlignX;
  const anchorX = alignX === "center" ? centerX : alignX === "right" ? rightX : leftX;
  const highlightBaseX =
    alignX === "center"
      ? centerX - Math.min(CARD_WIDTH - 260, Math.max(260, maxLineWidth + 54)) / 2
      : alignX === "right"
        ? rightX - Math.min(CARD_WIDTH - 260, Math.max(260, maxLineWidth + 54))
        : leftX - 12;
  let y = startY;

  ctx.textAlign = alignX;
  ctx.textBaseline = "top";
  ctx.fillStyle = config.coverTextColor;
  ctx.font = titleFont;

  const highlightColor = config.coverHighlightColor;
  if (titleLines.length > 0) {
    const highlightLineIdx = titleLines.length === 1 ? 0 : style.id === "grid-paper" ? 0 : 1;
    const idx = Math.max(0, Math.min(titleLines.length - 1, highlightLineIdx));
    const targetY = y + idx * titleLineHeightPx;
    const widthPadding = style.highlightStyle === "circle" ? 92 : 54;
    const minWidth = style.highlightStyle === "circle" ? 280 : 260;
    const w = Math.min(CARD_WIDTH - 260, Math.max(minWidth, ctx.measureText(titleLines[idx]).width + widthPadding));
    const highlightX =
      alignX === "center"
        ? centerX - w / 2
        : alignX === "right"
          ? rightX - w
          : highlightBaseX;
    drawTitleHighlight(ctx, style.highlightStyle, highlightX, targetY, w, config.coverFontSize, titleLineHeightPx, highlightColor);
  }

  for (const line of titleLines) {
    ctx.fillText(line, anchorX, y);
    y += titleLineHeightPx;
  }

  if (subtitleLines.length > 0) {
    y += subtitleGap;
    ctx.font = subtitleFont;
    ctx.globalAlpha = 0.95;
    for (const line of subtitleLines) {
      ctx.fillText(line, anchorX, y);
      y += subtitleLineHeightPx;
    }
    ctx.globalAlpha = 1;
  }

  if (config.coverShowStickers) {
    const pair = stickerImages[style.id];
    const primary = pair?.primary;
    const secondary = pair?.secondary;
    if (secondary && secondary.complete && secondary.naturalWidth > 0 && secondary.naturalHeight > 0) {
      const h = 180;
      const w = (secondary.naturalWidth / secondary.naturalHeight) * h;
      ctx.drawImage(secondary, 118, CARD_HEIGHT - 472, w, h);
    }
    if (primary && primary.complete && primary.naturalWidth > 0 && primary.naturalHeight > 0) {
      const h = style.id === "lime-question" ? 204 : 186;
      const w = (primary.naturalWidth / primary.naturalHeight) * h;
      ctx.drawImage(primary, CARD_WIDTH - 324, CARD_HEIGHT - 274, w, h);
    }
  }
}

function drawImageFocusCover(
  ctx: CanvasRenderingContext2D,
  title: string,
  subtitle: string,
  config: CardConfig,
  coverImage: HTMLImageElement | null
) {
  const imageAreaY = 120;
  const imageAreaH = Math.round(CARD_HEIGHT * 0.56);
  const radius = Math.max(0, Math.min(64, config.coverCardRadius));
  const leftX = 120;
  const rightX = CARD_WIDTH - 120;
  const centerX = CARD_WIDTH / 2;
  const alignX = config.coverTitleAlignX;
  const anchorX = alignX === "left" ? leftX : alignX === "right" ? rightX : centerX;

  if (coverImage && coverImage.complete && coverImage.naturalWidth > 0 && coverImage.naturalHeight > 0) {
    const scale = Math.max(CARD_WIDTH / coverImage.naturalWidth, imageAreaH / coverImage.naturalHeight);
    const drawW = coverImage.naturalWidth * scale;
    const drawH = coverImage.naturalHeight * scale;
    const drawX = (CARD_WIDTH - drawW) / 2;
    const drawY = imageAreaY + (imageAreaH - drawH) / 2;

    ctx.save();
    drawRoundedRect(ctx, 28, imageAreaY, CARD_WIDTH - 56, imageAreaH, radius);
    ctx.clip();
    ctx.drawImage(coverImage, drawX, drawY, drawW, drawH);
    ctx.restore();
  } else {
    const grad = ctx.createLinearGradient(0, imageAreaY, CARD_WIDTH, imageAreaY + imageAreaH);
    grad.addColorStop(0, "rgba(255,255,255,0.2)");
    grad.addColorStop(1, "rgba(0,0,0,0.24)");
    drawRoundedRect(ctx, 28, imageAreaY, CARD_WIDTH - 56, imageAreaH, radius, "#2a2622");
    ctx.fillStyle = grad;
    drawRoundedRect(ctx, 28, imageAreaY, CARD_WIDTH - 56, imageAreaH, radius, undefined);
    ctx.fillRect(28, imageAreaY, CARD_WIDTH - 56, imageAreaH);

    const fallbackTitleLines = wrapCoverTitleLines(
      ctx,
      title.trim() || "Untitled",
      `900 ${Math.max(58, config.coverFontSize * 0.86)}px ${config.coverFontFamily || config.fontFamily}`,
      CARD_WIDTH - 210
    ).slice(0, 3);
    const fallbackSubtitleLines = subtitle.trim()
      ? wrapCoverTitleLines(
          ctx,
          subtitle.trim(),
          `700 ${Math.max(36, config.coverSubtitleFontSize * 0.86)}px ${config.coverFontFamily || config.fontFamily}`,
          CARD_WIDTH - 230
        ).slice(0, 2)
      : [];
    const titleFontSize = Math.max(58, config.coverFontSize * 0.86);
    const subtitleFontSize = Math.max(36, config.coverSubtitleFontSize * 0.86);
    const titleLineHeight = titleFontSize * Math.max(1.08, config.coverLineHeight - 0.22);
    const subtitleLineHeight = subtitleFontSize * Math.max(1.12, config.coverLineHeight - 0.26);
    const subtitleGap = fallbackSubtitleLines.length > 0 ? Math.max(14, subtitleFontSize * 0.32) : 0;
    const blockHeight =
      fallbackTitleLines.length * titleLineHeight
      + subtitleGap
      + fallbackSubtitleLines.length * subtitleLineHeight;
    const textTop = imageAreaY + (imageAreaH - blockHeight) / 2;

    ctx.fillStyle = config.coverTextColor;
    ctx.textAlign = alignX;
    ctx.textBaseline = "top";
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 8;

    let y = textTop;
    ctx.font = `900 ${titleFontSize}px ${config.coverFontFamily || config.fontFamily}`;
    const coverStyle = findCoverStyle(config.coverStyleId);
    const highlightWidth = Math.max(
      280,
      Math.min(840, ctx.measureText(fallbackTitleLines[0] || "").width + 104)
    );
    const highlightX =
      alignX === "left"
        ? leftX - 12
        : alignX === "right"
          ? rightX - highlightWidth
          : centerX - highlightWidth / 2;
    drawTitleHighlight(
      ctx,
      coverStyle.highlightStyle,
      highlightX,
      y,
      highlightWidth,
      titleFontSize,
      titleLineHeight,
      config.coverHighlightColor
    );

    for (const line of fallbackTitleLines) {
      ctx.fillText(line, anchorX, y);
      y += titleLineHeight;
    }
    if (fallbackSubtitleLines.length > 0) {
      y += subtitleGap;
      ctx.font = `700 ${subtitleFontSize}px ${config.coverFontFamily || config.fontFamily}`;
      ctx.globalAlpha = 0.95;
      for (const line of fallbackSubtitleLines) {
        ctx.fillText(line, anchorX, y);
        y += subtitleLineHeight;
      }
      ctx.globalAlpha = 1;
    }
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }

  const coverTitle = title.trim() || "Untitled";
  const coverSubtitle = subtitle.trim();
  const titleFontSize = config.coverFontSize;
  const subtitleFontSize = config.coverSubtitleFontSize;
  const titleLines = coverTitle.replace(/\\n/g, "\n").split("\n").filter(Boolean);
  const subtitleLines = coverSubtitle
    ? coverSubtitle.replace(/\\n/g, "\n").split("\n").filter(Boolean).slice(0, 3)
    : [];
  const titleLineHeightPx = titleFontSize * config.coverLineHeight;
  const subtitleLineHeightPx = subtitleFontSize * Math.max(1.15, config.coverLineHeight - 0.16);
  const subtitleGap = subtitleLines.length > 0 ? Math.max(18, subtitleFontSize * 0.36) : 0;
  const safeLines = titleLines.length > 0 ? titleLines : ["Untitled"];
  const totalHeight =
    safeLines.length * titleLineHeightPx
    + subtitleGap
    + subtitleLines.length * subtitleLineHeightPx;
  const availableTop = imageAreaY + imageAreaH + 78;
  const availableBottom = CARD_HEIGHT - 92;
  const yRange = Math.max(0, availableBottom - availableTop - totalHeight);
  const startY =
    config.coverTitleAlignY === "top"
      ? availableTop
      : config.coverTitleAlignY === "bottom"
        ? availableTop + yRange
        : availableTop + yRange / 2;
  ctx.fillStyle = config.coverTextColor;
  ctx.textAlign = alignX;
  ctx.textBaseline = "top";
  ctx.font = `800 ${titleFontSize}px ${config.coverFontFamily || config.fontFamily}`;
  let y = startY;
  const coverStyle = findCoverStyle(config.coverStyleId);

  if (safeLines.length > 0) {
    const widthPadding = coverStyle.highlightStyle === "circle" ? 102 : 96;
    const minWidth = coverStyle.highlightStyle === "circle" ? 300 : 260;
    const strokeW = Math.max(minWidth, Math.min(760, ctx.measureText(safeLines[0]).width + widthPadding));
    const strokeX =
      alignX === "left"
        ? leftX - 12
        : alignX === "right"
          ? rightX - strokeW
          : centerX - strokeW / 2;
    drawTitleHighlight(ctx, coverStyle.highlightStyle, strokeX, y, strokeW, titleFontSize, titleLineHeightPx, config.coverHighlightColor);
  }

  for (const line of safeLines) {
    ctx.fillText(line, anchorX, y);
    y += titleLineHeightPx;
  }

  if (subtitleLines.length > 0) {
    y += subtitleGap;
    ctx.font = `700 ${subtitleFontSize}px ${config.coverFontFamily || config.fontFamily}`;
    ctx.globalAlpha = 0.95;
    for (const line of subtitleLines) {
      ctx.fillText(line, anchorX, y);
      y += subtitleLineHeightPx;
    }
    ctx.globalAlpha = 1;
  }
}

function drawCoverStylePreview(spec: CoverStyleSpec): string {
  return spec.preview;
}

function buildLinearGradient(ctx: CanvasRenderingContext2D, angleDeg: number, c1: string, c2: string, width: number, height: number) {
  const angle = (angleDeg * Math.PI) / 180;
  const cx = width / 2;
  const cy = height / 2;
  const rx = Math.cos(angle) * width;
  const ry = Math.sin(angle) * height;
  const grad = ctx.createLinearGradient(cx - rx, cy - ry, cx + rx, cy + ry);
  grad.addColorStop(0, c1);
  grad.addColorStop(1, c2);
  return grad;
}

function getLayoutMetrics(templateId: CardTemplateId, config: CardConfig, cardStyleId?: CardStyleId): LayoutMetrics {
  if (isCoilNotebookStyle(cardStyleId)) {
    return {
      x: 210,
      y: 168,
      width: CARD_WIDTH - 310,
      bottom: CARD_HEIGHT - 170,
    };
  }

  let base: LayoutMetrics;
  if (templateId === "polaroid") {
    base = { x: 156, y: 248, width: CARD_WIDTH - 312, bottom: CARD_HEIGHT - 210 };
  } else if (templateId === "cinematic-film") {
    base = { x: 108, y: 204, width: CARD_WIDTH - 216, bottom: CARD_HEIGHT - 182 };
  } else if (templateId === "ios-memo") {
    base = { x: 108, y: 214, width: CARD_WIDTH - 216, bottom: CARD_HEIGHT - 142 };
  } else {
    base = { x: 96, y: 154, width: CARD_WIDTH - 192, bottom: CARD_HEIGHT - 132 };
  }

  const delta = Math.max(-18, Math.min(45, config.textPadding - BASE_TEXT_PADDING));
  const x = base.x + delta;
  const width = Math.max(440, base.width - delta * 2);
  return {
    x,
    y: base.y,
    width,
    bottom: base.bottom,
  };
}

function getCoilGridColor(config: CardConfig): string {
  const bg = config.bgColor.toLowerCase();
  if (bg === "#ffd66b" || bg === "#ffe59d") return "rgba(0,0,0,0.1)";
  return "rgba(255,255,255,0.2)";
}

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill?: string,
  stroke?: string
) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function drawBaseBackground(ctx: CanvasRenderingContext2D, config: CardConfig) {
  if (config.bgMode === "gradient") {
    ctx.fillStyle = buildLinearGradient(
      ctx,
      config.gradientAngle,
      config.gradientStart,
      config.gradientEnd,
      CARD_WIDTH,
      CARD_HEIGHT
    );
  } else {
    ctx.fillStyle = config.bgColor;
  }
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
}

function drawTemplateBackground(
  ctx: CanvasRenderingContext2D,
  template: CardTemplateId,
  pageIndex: number,
  metrics: LayoutMetrics,
  config: CardConfig,
  cardStyleId?: CardStyleId
) {
  drawBaseBackground(ctx, config);

  if (isCoilNotebookStyle(cardStyleId)) {
    const gridColor = getCoilGridColor(config);
    ctx.save();
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 2;
    for (let x = -12; x <= CARD_WIDTH + 20; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CARD_HEIGHT);
      ctx.stroke();
    }
    for (let y = -12; y <= CARD_HEIGHT + 20; y += 48) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CARD_WIDTH, y);
      ctx.stroke();
    }
    ctx.restore();

    const paperX = 105;
    const paperY = 73;
    const paperW = CARD_WIDTH - 210;
    const paperH = CARD_HEIGHT - 146;
    const coilW = 76;
    const holeRadius = 23;
    const holeStep = 104;
    const firstHoleY = paperY + 82;

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.12)";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(paperX, paperY, paperW, paperH);
    ctx.restore();

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(paperX, paperY, coilW, paperH);

    ctx.save();
    ctx.strokeStyle = "rgba(36,41,46,0.62)";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.fillStyle = config.bgColor;
    for (let y = firstHoleY; y <= paperY + paperH - 44; y += holeStep) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(paperX, y - 12, 54, 24);
      ctx.beginPath();
      ctx.moveTo(paperX, y - 23);
      ctx.lineTo(paperX + 50, y - 23);
      ctx.quadraticCurveTo(paperX + 70, y - 23, paperX + 70, y);
      ctx.stroke();
      ctx.fillStyle = config.bgColor;
      ctx.beginPath();
      ctx.arc(paperX + coilW - 12, y, holeRadius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    return;
  }

  if (template === "blank") return;

  if (template === "minimalist-magazine") {
    ctx.fillStyle = "rgba(17,17,17,0.95)";
    ctx.fillRect(0, 0, CARD_WIDTH, 22);
    ctx.fillRect(0, CARD_HEIGHT - 18, CARD_WIDTH, 18);
    return;
  }

  if (template === "swiss-studio") {
    ctx.fillStyle = config.accentColor;
    ctx.fillRect(0, 0, 18, CARD_HEIGHT);
    ctx.fillStyle = "rgba(0,0,0,0.78)";
    ctx.fillRect(40, 42, 160, 8);
    return;
  }

  if (template === "pro-doc") {
    ctx.fillStyle = config.accentColor;
    ctx.fillRect(0, 0, CARD_WIDTH, 12);
    ctx.strokeStyle = "rgba(37,99,235,0.14)";
    ctx.lineWidth = 1;
    for (let y = 180; y < CARD_HEIGHT; y += 58) {
      ctx.beginPath();
      ctx.moveTo(metrics.x, y);
      ctx.lineTo(CARD_WIDTH - metrics.x, y);
      ctx.stroke();
    }
    return;
  }

  if (template === "notion-style") {
    ctx.strokeStyle = "rgba(55,53,47,0.08)";
    ctx.lineWidth = 1;
    for (let y = 190; y < CARD_HEIGHT; y += 62) {
      ctx.beginPath();
      ctx.moveTo(metrics.x, y);
      ctx.lineTo(CARD_WIDTH - metrics.x, y);
      ctx.stroke();
    }
    return;
  }

  if (template === "ios-memo") {
    ctx.strokeStyle = "rgba(224,198,93,0.45)";
    ctx.lineWidth = 1;
    for (let y = 210; y < CARD_HEIGHT; y += 52) {
      ctx.beginPath();
      ctx.moveTo(metrics.x, y);
      ctx.lineTo(CARD_WIDTH - metrics.x, y);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(201,149,0,0.35)";
    ctx.fillRect(metrics.x - 18, 130, 4, CARD_HEIGHT - 220);
    return;
  }

  if (template === "polaroid") {
    drawRoundedRect(ctx, 86, 62, CARD_WIDTH - 172, CARD_HEIGHT - 122, 6, "rgba(255,255,255,0.92)", "rgba(0,0,0,0.08)");
    drawRoundedRect(ctx, 146, 134, CARD_WIDTH - 292, 360, 2, "rgba(0,0,0,0.06)");
    return;
  }

  if (template === "elegant-book") {
    const gutter = ctx.createLinearGradient(0, 0, 150, 0);
    gutter.addColorStop(0, "rgba(0,0,0,0.12)");
    gutter.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gutter;
    ctx.fillRect(0, 0, 150, CARD_HEIGHT);
    return;
  }

  if (template === "aura-gradient") {
    const aura = ctx.createRadialGradient(CARD_WIDTH * 0.2, CARD_HEIGHT * 0.1, 10, CARD_WIDTH * 0.2, CARD_HEIGHT * 0.1, 620);
    aura.addColorStop(0, "rgba(255,255,255,0.35)");
    aura.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = aura;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
    return;
  }

  if (template === "deep-night") {
    drawRoundedRect(ctx, 24, 24, CARD_WIDTH - 48, CARD_HEIGHT - 48, 10, undefined, "rgba(0, 212, 255, 0.35)");
    return;
  }

  if (template === "starry-night") {
    const rand = seededRandom(pageIndex + 17);
    for (let i = 0; i < 180; i += 1) {
      const x = rand() * CARD_WIDTH;
      const y = rand() * CARD_HEIGHT;
      const r = rand() * 1.8;
      const alpha = 0.3 + rand() * 0.65;
      ctx.fillStyle = `rgba(255, 255, 230, ${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  // cinematic-film
  ctx.fillStyle = "rgba(0,0,0,0.92)";
  ctx.fillRect(0, 0, CARD_WIDTH, 100);
  ctx.fillRect(0, CARD_HEIGHT - 100, CARD_WIDTH, 100);

  const rand = seededRandom(pageIndex + 1337);
  for (let i = 0; i < 4200; i += 1) {
    const x = rand() * CARD_WIDTH;
    const y = rand() * CARD_HEIGHT;
    const alpha = rand() * 0.06;
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.fillRect(x, y, 1.2, 1.2);
  }
}

function fontString(style: ComputedChunkStyle): string {
  return `${style.fontStyle} ${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`;
}

function sameStyle(a: ComputedChunkStyle, b: ComputedChunkStyle): boolean {
  return (
    a.fontSize === b.fontSize
    && a.lineHeight === b.lineHeight
    && a.fontWeight === b.fontWeight
    && a.fontStyle === b.fontStyle
    && a.fontFamily === b.fontFamily
    && a.color === b.color
    && a.highlightColor === b.highlightColor
    && a.strike === b.strike
    && a.letterSpacing === b.letterSpacing
  );
}

function measureTextWithSpacing(ctx: CanvasRenderingContext2D, text: string, letterSpacing: number): number {
  const chars = Array.from(text);
  if (chars.length === 0) return 0;
  let width = 0;
  for (let i = 0; i < chars.length; i += 1) {
    width += ctx.measureText(chars[i]).width;
    if (i < chars.length - 1) width += letterSpacing;
  }
  return width;
}

function drawTextWithSpacing(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, letterSpacing: number): number {
  const chars = Array.from(text);
  let cursor = x;
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width;
    if (i < chars.length - 1) cursor += letterSpacing;
  }
  return cursor - x;
}

function getTypography(kind: TextBlockKind, accentColor: string, textColor: string, config: CardConfig): Typography {
  if (kind === "heading1") {
    const size = Math.round(config.fontSize * config.h1Scale);
    return {
      fontSize: size,
      lineHeight: Math.max(1.16, config.lineHeight - 0.22),
      fontWeight: "800",
      fontFamily: config.fontFamily,
      color: accentColor,
      marginTop: Math.round(size * 0.28),
      marginBottom: Math.round(size * 0.38),
    };
  }

  if (kind === "heading2") {
    const size = Math.round(config.fontSize * config.h2Scale);
    return {
      fontSize: size,
      lineHeight: Math.max(1.2, config.lineHeight - 0.18),
      fontWeight: "700",
      fontFamily: config.fontFamily,
      color: accentColor,
      marginTop: Math.round(size * 0.24),
      marginBottom: Math.round(size * 0.3),
    };
  }

  if (kind === "heading3") {
    const size = Math.round(config.fontSize * config.h3Scale);
    return {
      fontSize: size,
      lineHeight: Math.max(1.25, config.lineHeight - 0.14),
      fontWeight: "700",
      fontFamily: config.fontFamily,
      color: accentColor,
      marginTop: Math.round(size * 0.2),
      marginBottom: Math.round(size * 0.26),
    };
  }

  if (kind === "heading4") {
    const size = Math.max(24, Math.round(config.fontSize * Math.min(config.h3Scale, 1.06)));
    return {
      fontSize: size,
      lineHeight: Math.max(1.28, config.lineHeight - 0.12),
      fontWeight: "650",
      fontFamily: config.fontFamily,
      color: accentColor,
      marginTop: Math.round(size * 0.18),
      marginBottom: Math.round(size * 0.22),
    };
  }

  if (kind === "quote") {
    return {
      fontSize: Math.max(26, Math.round(config.fontSize * 0.95)),
      lineHeight: config.lineHeight,
      fontWeight: "500",
      fontFamily: config.fontFamily,
      color: textColor,
      marginTop: 10,
      marginBottom: 14,
    };
  }

  if (kind === "code") {
    return {
      fontSize: Math.max(22, Math.round(config.fontSize * 0.82)),
      lineHeight: Math.max(1.45, config.lineHeight - 0.12),
      fontWeight: "500",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      color: textColor,
      marginTop: 8,
      marginBottom: 12,
    };
  }

  return {
    fontSize: config.fontSize,
    lineHeight: config.lineHeight,
    fontWeight: "500",
    fontFamily: config.fontFamily,
    color: textColor,
    marginTop: 8,
    marginBottom: 12,
  };
}

function resolveChunkStyle(base: Typography, flags: TextFlags, accentColor: string, highlightColor: string, config: CardConfig): ComputedChunkStyle {
  const fontSize = flags.code ? Math.max(20, Math.round(base.fontSize * 0.92)) : base.fontSize;
  return {
    fontSize,
    lineHeight: base.lineHeight,
    fontWeight: flags.bold ? "700" : base.fontWeight,
    fontStyle: flags.italic ? "italic" : "normal",
    fontFamily: flags.code ? "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" : base.fontFamily,
    color: flags.link ? accentColor : base.color,
    highlightColor: flags.highlight ? highlightColor : undefined,
    strike: flags.strike,
    letterSpacing: flags.code ? 0 : config.letterSpacing,
  };
}

function pushText(chunks: InlineChunk[], text: string, flags: TextFlags) {
  if (!text) return;
  const last = chunks[chunks.length - 1];
  if (
    last
    && last.flags.bold === flags.bold
    && last.flags.italic === flags.italic
    && last.flags.code === flags.code
    && last.flags.strike === flags.strike
    && last.flags.highlight === flags.highlight
    && last.flags.link === flags.link
  ) {
    last.text += text;
    return;
  }
  chunks.push({ text, flags: { ...flags } });
}

function parseInlineChildren(children: Token[] | null | undefined): InlineChunk[] {
  if (!children || children.length === 0) return [];
  const chunks: InlineChunk[] = [];
  const state: TextFlags = {};

  for (const token of children) {
    switch (token.type) {
      case "strong_open":
        state.bold = true;
        break;
      case "strong_close":
        state.bold = false;
        break;
      case "em_open":
        state.italic = true;
        break;
      case "em_close":
        state.italic = false;
        break;
      case "s_open":
        state.strike = true;
        break;
      case "s_close":
        state.strike = false;
        break;
      case "mark_open":
        state.highlight = true;
        break;
      case "mark_close":
        state.highlight = false;
        break;
      case "link_open":
        state.link = true;
        break;
      case "link_close":
        state.link = false;
        break;
      case "code_inline":
        pushText(chunks, token.content || "", { ...state, code: true });
        break;
      case "text":
        pushText(chunks, token.content || "", state);
        break;
      case "softbreak":
      case "hardbreak":
        pushText(chunks, "\n", state);
        break;
      default:
        if (token.content) pushText(chunks, token.content, state);
        break;
    }
  }

  return chunks;
}

function stripHtmlTagsPreservingBreaks(input: string): string {
  if (!input) return "";
  return input
    .replace(/<(br|BR)\s*\/?>/g, "\n")
    .replace(/<\/(p|div|section|article|li|h1|h2|h3|h4|h5|h6)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitMarkdownBlocks(markdown: string): string[] {
  return (markdown ?? "")
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseMarkdownBlocks(markdown: string): ParsedBlock[] {
  const md = getMarkdownParser();
  const tokens = md.parse(markdown ?? "", {});
  const blocks: ParsedBlock[] = [];

  let quoteDepth = 0;
  const listStack: Array<{ ordered: boolean; next: number }> = [];
  let listItemDepth = 0;
  let listItemPrefix = "";
  let listItemNeedPrefix = false;
  let pendingKind: "paragraph" | "heading" | null = null;
  let pendingHeadingLevel: 1 | 2 | 3 | 4 = 1;
  let inTable = false;
  let tableColumnCount = 0;
  let tableRows: Array<{ cells: InlineChunk[][]; header: boolean }> = [];
  let currentTableRow: InlineChunk[][] | null = null;
  let currentTableCell: InlineChunk[] | null = null;
  let pendingTableHeaderRow = false;

  const flushTable = () => {
    if (!inTable || tableRows.length === 0) return;
    const maxCols = Math.max(tableColumnCount, ...tableRows.map((row) => row.cells.length));
    if (maxCols <= 0) return;
    const normalizedRows: ParsedTableRow[] = tableRows.map((row) => ({
      header: row.header,
      cells: Array.from({ length: maxCols }, (_, idx) => row.cells[idx] ?? []),
    }));
    blocks.push({ kind: "table", rows: normalizedRows, columnCount: maxCols, indent: 0 });
  };

  for (const token of tokens) {
    switch (token.type) {
      case "blockquote_open":
        quoteDepth += 1;
        break;
      case "blockquote_close":
        quoteDepth = Math.max(0, quoteDepth - 1);
        break;
      case "ordered_list_open": {
        const startAttr = token.attrGet("start");
        const start = Number(startAttr || "1");
        listStack.push({ ordered: true, next: Number.isNaN(start) ? 1 : start });
        break;
      }
      case "bullet_list_open":
        listStack.push({ ordered: false, next: 1 });
        break;
      case "ordered_list_close":
      case "bullet_list_close":
        listStack.pop();
        break;
      case "list_item_open": {
        listItemDepth += 1;
        const top = listStack[listStack.length - 1];
        if (top) {
          listItemPrefix = top.ordered ? `${top.next}. ` : "• ";
          if (top.ordered) top.next += 1;
        } else {
          listItemPrefix = "• ";
        }
        listItemNeedPrefix = true;
        break;
      }
      case "list_item_close":
        listItemDepth = Math.max(0, listItemDepth - 1);
        listItemPrefix = "";
        listItemNeedPrefix = false;
        break;
      case "heading_open":
        pendingKind = "heading";
        pendingHeadingLevel = Number(token.tag.replace("h", "")) as 1 | 2 | 3 | 4;
        if (![1, 2, 3, 4].includes(pendingHeadingLevel)) pendingHeadingLevel = 4;
        break;
      case "table_open":
        inTable = true;
        tableColumnCount = 0;
        tableRows = [];
        currentTableRow = null;
        currentTableCell = null;
        pendingTableHeaderRow = false;
        break;
      case "table_close":
        flushTable();
        inTable = false;
        tableColumnCount = 0;
        tableRows = [];
        currentTableRow = null;
        currentTableCell = null;
        pendingTableHeaderRow = false;
        break;
      case "thead_open":
        pendingTableHeaderRow = true;
        break;
      case "tbody_open":
        pendingTableHeaderRow = false;
        break;
      case "tr_open":
        if (inTable) currentTableRow = [];
        break;
      case "tr_close":
        if (inTable && currentTableRow) {
          tableColumnCount = Math.max(tableColumnCount, currentTableRow.length);
          tableRows.push({ cells: currentTableRow, header: pendingTableHeaderRow });
        }
        currentTableRow = null;
        break;
      case "th_open":
      case "td_open":
        if (inTable) currentTableCell = [];
        break;
      case "th_close":
      case "td_close":
        if (inTable) {
          if (!currentTableCell) currentTableCell = [];
          if (currentTableRow) currentTableRow.push(currentTableCell);
        }
        currentTableCell = null;
        break;
      case "paragraph_open":
        pendingKind = "paragraph";
        break;
      case "hr":
        blocks.push({ kind: "hr" });
        break;
      case "fence":
      case "code_block": {
        const lines = (token.content || "").replace(/\r\n/g, "\n").split("\n");
        for (const line of lines) {
          blocks.push({ kind: "code", chunks: [{ text: line || " ", flags: { code: true } }], indent: 0 });
        }
        break;
      }
      case "inline": {
        const chunks = parseInlineChildren(token.children);
        if (chunks.length === 0) break;

        if (inTable) {
          if (currentTableCell) currentTableCell.push(...chunks);
          break;
        }

        let kind: TextBlockKind = "paragraph";
        if (pendingKind === "heading") {
          kind =
            pendingHeadingLevel === 1
              ? "heading1"
              : pendingHeadingLevel === 2
                ? "heading2"
                : pendingHeadingLevel === 3
                  ? "heading3"
                  : "heading4";
        } else if (listItemDepth > 0) {
          kind = "list";
        } else if (quoteDepth > 0) {
          kind = "quote";
        }

        if (kind === "list" && listItemNeedPrefix && listItemPrefix) {
          chunks.unshift({ text: listItemPrefix, flags: { bold: true } });
          listItemNeedPrefix = false;
        }

        const listIndent = kind === "list" ? Math.max(0, listStack.length - 1) * 32 : 0;
        const quoteIndent = kind === "quote" ? quoteDepth * 26 : 0;
        blocks.push({ kind, chunks, indent: listIndent + quoteIndent });
        break;
      }
      case "html_inline":
      case "html_block": {
        const normalized = stripHtmlTagsPreservingBreaks(token.content || "");
        if (!normalized) break;
        const kind: TextBlockKind = quoteDepth > 0 ? "quote" : "paragraph";
        const indent = quoteDepth > 0 ? quoteDepth * 26 : 0;
        const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
        for (const line of lines) {
          blocks.push({ kind, chunks: [{ text: line, flags: {} }], indent });
        }
        break;
      }
      case "paragraph_close":
      case "heading_close":
        pendingKind = null;
        break;
      default:
        break;
    }
  }

  return blocks;
}

function wrapInlineChunks(
  ctx: CanvasRenderingContext2D,
  chunks: InlineChunk[],
  base: Typography,
  accentColor: string,
  highlightColor: string,
  config: CardConfig,
  maxWidth: number
): RenderLine[] {
  if (chunks.length === 0) return [];

  const lines: RenderLine[] = [];
  const availableWidth = Math.max(40, maxWidth);
  let currentChunks: RenderChunk[] = [];
  let currentWidth = 0;
  let currentLineHeight = base.fontSize * base.lineHeight;

  const pushLine = () => {
    if (currentChunks.length === 0) return;
    lines.push({ chunks: currentChunks, height: currentLineHeight });
    currentChunks = [];
    currentWidth = 0;
    currentLineHeight = base.fontSize * base.lineHeight;
  };

  const appendChar = (char: string, style: ComputedChunkStyle) => {
    const last = currentChunks[currentChunks.length - 1];
    if (last && sameStyle(last.style, style)) {
      last.text += char;
    } else {
      currentChunks.push({ text: char, style });
    }
  };

  for (const chunk of chunks) {
    for (const char of Array.from(chunk.text)) {
      if (char === "\n") {
        pushLine();
        continue;
      }

      const style = resolveChunkStyle(base, chunk.flags, accentColor, highlightColor, config);
      ctx.font = fontString(style);
      const charWidth = ctx.measureText(char).width + style.letterSpacing;

      if (currentWidth + charWidth > availableWidth && currentChunks.length > 0) {
        pushLine();
      }

      appendChar(char, style);
      currentWidth += charWidth;
      currentLineHeight = Math.max(currentLineHeight, style.fontSize * style.lineHeight);
    }
  }

  pushLine();
  return lines;
}

function buildLayoutBlocks(markdown: string, templateId: CardTemplateId, config: CardConfig, cardStyleId?: CardStyleId): Array<LayoutBlock | { kind: "hr" }> {
  if (typeof document === "undefined") return [];

  const parsed = parseMarkdownBlocks(markdown);
  const template = findTemplate(templateId);
  const effectiveConfig = isCoilNotebookStyle(cardStyleId) ? getCoilNotebookRenderConfig(config) : config;
  const metrics = getLayoutMetrics(templateId, effectiveConfig, cardStyleId);

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];

  const output: Array<LayoutBlock | { kind: "hr" }> = [];

  for (const block of parsed) {
    if (block.kind === "hr") {
      output.push({ kind: "hr" });
      continue;
    }

    if (block.kind === "table") {
      const tableTypography = getTypography("paragraph", effectiveConfig.accentColor || template.defaultAccentColor, effectiveConfig.textColor || template.defaultTextColor, effectiveConfig);
      const tableHeaderTypography: Typography = {
        ...tableTypography,
        fontWeight: "700",
      };
      const tableMarginTop = 14;
      const tableMarginBottom = 18;
      const cellPaddingX = 14;
      const cellPaddingY = 12;
      const availableWidth = Math.max(220, metrics.width - block.indent);
      const columnCount = Math.max(1, block.columnCount);
      const columnWidth = Math.max(120, Math.floor(availableWidth / columnCount));
      const rows: LayoutTableRow[] = [];

      for (const row of block.rows) {
        const cellLines: RenderLine[][] = [];
        let rowContentHeight = 0;
        for (let i = 0; i < columnCount; i += 1) {
          const cellChunks = row.cells[i] ?? [];
          const lines = wrapInlineChunks(
            ctx,
            cellChunks,
            row.header ? tableHeaderTypography : tableTypography,
            effectiveConfig.accentColor || template.defaultAccentColor,
            `rgba(${parseInt((effectiveConfig.accentColor || template.defaultAccentColor).slice(1, 3), 16)}, ${parseInt((effectiveConfig.accentColor || template.defaultAccentColor).slice(3, 5), 16)}, ${parseInt((effectiveConfig.accentColor || template.defaultAccentColor).slice(5, 7), 16)}, 0.2)`,
            effectiveConfig,
            Math.max(40, columnWidth - cellPaddingX * 2)
          );
          const contentHeight = lines.length > 0
            ? lines.reduce((sum, line) => sum + line.height, 0)
            : tableTypography.fontSize * tableTypography.lineHeight;
          rowContentHeight = Math.max(rowContentHeight, contentHeight);
          cellLines.push(lines);
        }

        rows.push({
          cells: cellLines,
          header: row.header,
          height: Math.max(46, rowContentHeight + cellPaddingY * 2),
        });
      }

      output.push({
        kind: "table",
        rows,
        columnCount,
        columnWidth,
        indent: block.indent,
        marginTop: tableMarginTop,
        marginBottom: tableMarginBottom,
      });
      continue;
    }

    const typography = getTypography(block.kind, effectiveConfig.accentColor || template.defaultAccentColor, effectiveConfig.textColor || template.defaultTextColor, effectiveConfig);
    const wrappedLines = wrapInlineChunks(
      ctx,
      block.chunks,
      typography,
      effectiveConfig.accentColor || template.defaultAccentColor,
      `rgba(${parseInt((effectiveConfig.accentColor || template.defaultAccentColor).slice(1, 3), 16)}, ${parseInt((effectiveConfig.accentColor || template.defaultAccentColor).slice(3, 5), 16)}, ${parseInt((effectiveConfig.accentColor || template.defaultAccentColor).slice(5, 7), 16)}, 0.2)`,
      effectiveConfig,
      metrics.width - block.indent
    );
    if (wrappedLines.length === 0) continue;

    output.push({
      kind: block.kind,
      lines: wrappedLines,
      indent: block.indent,
      marginTop: typography.marginTop,
      marginBottom: typography.marginBottom,
    });
  }

  return output;
}

function estimateMarkdownBlockUnits(markdown: string): number {
  const plain = markdownToPlainText(markdown) || markdown.replace(/[#>*_`~\-[\]()]/g, "");
  const tableLines = markdown.split(/\n/).filter((line) => line.includes("|")).length;
  const codeLines = markdown.split(/\n/).filter((line) => line.trim().startsWith("```")).length;
  return Array.from(plain).reduce((sum, char) => sum + (/[A-Za-z0-9]/.test(char) ? 0.58 : /\s/.test(char) ? 0.25 : 1), 0)
    + tableLines * 14
    + codeLines * 10;
}

function splitOversizedMarkdownBlock(markdown: string, maxUnits: number): string[] {
  const plain = markdownToPlainText(markdown);
  if (!plain || estimateMarkdownBlockUnits(markdown) <= maxUnits) return [markdown];
  const chunks: string[] = [];
  let current = "";
  let units = 0;
  for (const char of Array.from(plain)) {
    const nextUnit = /[A-Za-z0-9]/.test(char) ? 0.58 : /\s/.test(char) ? 0.25 : 1;
    if (current && units + nextUnit > maxUnits) {
      chunks.push(current.trim());
      current = char;
      units = nextUnit;
    } else {
      current += char;
      units += nextUnit;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [markdown];
}

function isMarkdownTableBlock(markdown: string): boolean {
  const lines = markdown
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length >= 2
    && lines[0].includes("|")
    && /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(lines[1]);
}

function splitMarkdownBlockByLines(markdown: string): string[] {
  if (isMarkdownTableBlock(markdown)) return [markdown];
  const lines = markdown
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length > 1 ? lines : [markdown];
}

function splitMarkdownTextForPagination(markdown: string, maxUnits: number): string[] {
  const lineParts = splitMarkdownBlockByLines(markdown);
  if (lineParts.length > 1) {
    return lineParts.flatMap((part) => splitMarkdownTextForPagination(part, maxUnits));
  }

  const plain = markdownToPlainText(markdown);
  if (!plain || estimateMarkdownBlockUnits(markdown) <= maxUnits) return [markdown];

  const sentenceParts = plain
    .split(/(?<=[。！？!?；;])/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (sentenceParts.length > 1) {
    return sentenceParts.flatMap((part) => splitOversizedMarkdownBlock(part, maxUnits));
  }

  return splitOversizedMarkdownBlock(markdown, maxUnits);
}

function measureMd2CardPageFits(
  markdown: string,
  config: CardConfig,
  cardStyleId: CardStyleId,
  cardStyleModeId: CardStyleModeId
): boolean {
  if (typeof document === "undefined") return true;
  if (!markdown.trim()) return true;

  const rootId = "xhs-md2card-pagination-measure-root";
  let root = document.getElementById(rootId) as HTMLDivElement | null;
  if (!root) {
    root = document.createElement("div");
    root.id = rootId;
    root.setAttribute("aria-hidden", "true");
    root.style.cssText = [
      "position:absolute",
      "left:-10000px",
      "top:0",
      `width:${MD2CARD_PREVIEW_WIDTH}px`,
      `height:${MD2CARD_PREVIEW_HEIGHT}px`,
      "overflow:hidden",
      "visibility:hidden",
      "pointer-events:none",
      "z-index:-1",
    ].join(";");
    document.body.appendChild(root);
  }

  const page: CardPage = { type: "content", lines: [], markdown };
  root.innerHTML = [
    `<style>${escapeStyleForSvg(buildMd2CardCss(config, cardStyleId, 1))}</style>`,
    `<div class="md2card-preview-shell" style="width:${MD2CARD_PREVIEW_WIDTH}px;height:${MD2CARD_PREVIEW_HEIGHT}px;overflow:hidden;">`,
    renderMd2CardHtml(page, 0, 1, config, cardStyleId, cardStyleModeId),
    "</div>",
  ].join("");

  const card = root.querySelector<HTMLElement>(".card");
  const content = root.querySelector<HTMLElement>(".card-content");
  const inner = root.querySelector<HTMLElement>(".card-content-inner");
  const measured = inner || content || card;
  if (!card || !measured) return true;

  const cardRect = card.getBoundingClientRect();
  const contentRect = content?.getBoundingClientRect();
  const footerRect = root.querySelector<HTMLElement>(".card-footer")?.getBoundingClientRect();
  const bottomLimit = content && content.clientHeight > 0
    ? contentRect!.top + content.clientHeight
    : cardRect.bottom - (footerRect?.height || 0);

  let contentBottom = measured.getBoundingClientRect().top;
  const children = Array.from(measured.children) as HTMLElement[];
  for (const child of children) {
    const rect = child.getBoundingClientRect();
    contentBottom = Math.max(contentBottom, rect.bottom);
  }

  const scrollOverflow = Math.max(measured.scrollHeight - measured.clientHeight, 0);
  return contentBottom <= bottomLimit + 1 && scrollOverflow <= 1;
}

function paginateMarkdown(
  markdown: string,
  templateId: CardTemplateId,
  config: CardConfig,
  cardStyleId: CardStyleId,
  cardStyleModeId: CardStyleModeId
): CardPage[] {
  void templateId;
  const pages: CardPage[] = [];
  if (config.hasCover) pages.push({ type: "cover" });
  const bodyFontSize = Math.max(12, config.fontSize / 2);
  const maxUnits = Math.max(60, Math.round(3900 / (bodyFontSize * config.lineHeight)));
  const blocks = splitMarkdownBlocks(markdown).filter((block) => !isHorizontalRuleLine(block.trim()));
  let currentMarkdown: string[] = [];
  let currentUnits = 0;

  const flushPage = () => {
    if (currentMarkdown.length > 0) {
      pages.push({ type: "content", lines: [], markdown: currentMarkdown.join("\n\n") });
      currentMarkdown = [];
      currentUnits = 0;
    }
  };

  const currentWith = (part: string) => [...currentMarkdown, part].join("\n\n");
  const wouldFit = (part: string) => measureMd2CardPageFits(currentWith(part), config, cardStyleId, cardStyleModeId);

  for (const block of blocks.length > 0 ? blocks : [""]) {
    const expandedBlocks = splitMarkdownTextForPagination(block, maxUnits);
    for (const part of expandedBlocks) {
      const units = estimateMarkdownBlockUnits(part) + 16;
      if (/^#{1,6}\s+/.test(part.trim()) && currentMarkdown.length > 0) flushPage();
      if (currentMarkdown.length > 0 && (currentUnits + units > maxUnits || !wouldFit(part))) flushPage();
      currentMarkdown.push(part);
      currentUnits += units;
      if (currentUnits >= maxUnits) {
        flushPage();
      }
    }
  }

  flushPage();
  return pages.length > 0 ? pages : [{ type: "content", lines: [], markdown: "" }];
}

function drawWatermark(ctx: CanvasRenderingContext2D, config: CardConfig) {
  if (!config.hasWatermark || !config.watermarkText.trim()) return;
  ctx.save();
  ctx.fillStyle = config.watermarkColor;
  ctx.font = `600 56px ${config.fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let y = 220; y <= CARD_HEIGHT; y += 300) {
    for (let x = 180; x <= CARD_WIDTH; x += 360) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-0.38);
      ctx.fillText(config.watermarkText, 0, 0);
      ctx.restore();
    }
  }
  ctx.restore();
}

function drawGridOverlay(ctx: CanvasRenderingContext2D, metrics: LayoutMetrics) {
  ctx.save();
  ctx.strokeStyle = "rgba(120, 120, 120, 0.18)";
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 6]);
  for (let x = metrics.x; x <= metrics.x + metrics.width; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, metrics.y);
    ctx.lineTo(x, metrics.bottom);
    ctx.stroke();
  }
  for (let y = metrics.y; y <= metrics.bottom; y += 48) {
    ctx.beginPath();
    ctx.moveTo(metrics.x, y);
    ctx.lineTo(metrics.x + metrics.width, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSocialIcons(ctx: CanvasRenderingContext2D, config: CardConfig, socialIconImages: Partial<Record<SocialIconId, HTMLImageElement | null>>) {
  if (!config.hasSocialIcons || config.selectedSocialIcons.length === 0) return;

  const selected = config.selectedSocialIcons
    .map((id) => SOCIAL_ICON_OPTIONS.find((it) => it.id === id))
    .filter((it): it is NonNullable<typeof it> => Boolean(it));

  if (selected.length === 0) return;

  const itemW = 66;
  const itemH = 66;
  const gap = 14;
  const totalW = selected.length * itemW + (selected.length - 1) * gap;
  let startX = CARD_WIDTH - totalW - 62;
  let y = 52;

  if (config.socialIconPosition === "bottom-center") {
    startX = (CARD_WIDTH - totalW) / 2;
    y = CARD_HEIGHT - 126;
  }

  for (let i = 0; i < selected.length; i += 1) {
    const icon = selected[i];
    const x = startX + i * (itemW + gap);
    drawRoundedRect(ctx, x, y, itemW, itemH, 20, "rgba(0,0,0,0.12)");
    drawRoundedRect(ctx, x + 1, y + 1, itemW - 2, itemH - 2, 20, "rgba(255,255,255,0.95)");
    const iconImage = socialIconImages[icon.id];
    if (iconImage && iconImage.complete && iconImage.naturalWidth > 0 && iconImage.naturalHeight > 0) {
      const maxIcon = 38;
      const ratio = Math.min(maxIcon / iconImage.naturalWidth, maxIcon / iconImage.naturalHeight);
      const drawW = iconImage.naturalWidth * ratio;
      const drawH = iconImage.naturalHeight * ratio;
      const drawX = x + (itemW - drawW) / 2;
      const drawY = y + (itemH - drawH) / 2;
      ctx.drawImage(iconImage, drawX, drawY, drawW, drawH);
    } else {
      ctx.fillStyle = config.accentColor;
      ctx.font = `700 20px ${config.fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText((icon.labelEn || "?").slice(0, 1), x + itemW / 2, y + itemH / 2 + 1);
    }
  }
}

function drawCoverPage(
  ctx: CanvasRenderingContext2D,
  title: string,
  subtitle: string,
  templateId: CardTemplateId,
  config: CardConfig,
  coverImage: HTMLImageElement | null,
  stickerImages: Partial<Record<CoverStyleId, { primary: HTMLImageElement | null; secondary: HTMLImageElement | null }>>
) {
  void templateId;
  const coverStyle = findCoverStyle(config.coverStyleId);
  if (coverStyle.layout === "image") {
    drawImageFocusCover(ctx, title, subtitle, config, coverImage);
    return;
  }
  drawPosterCover(ctx, coverStyle, title, subtitle, config, stickerImages);
}

function renderPageCanvas(
  page: CardPage,
  title: string,
  subtitle: string,
  templateId: CardTemplateId,
  config: CardConfig,
  cardStyleId: CardStyleId,
  pageIndex: number,
  totalPages: number,
  coverImage: HTMLImageElement | null,
  socialIconImages: Partial<Record<SocialIconId, HTMLImageElement | null>>,
  stickerImages: Partial<Record<CoverStyleId, { primary: HTMLImageElement | null; secondary: HTMLImageElement | null }>>
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const effectiveConfig = isCoilNotebookStyle(cardStyleId) ? getCoilNotebookRenderConfig(config) : config;
  const metrics = getLayoutMetrics(templateId, effectiveConfig, cardStyleId);
  drawTemplateBackground(ctx, templateId, pageIndex, metrics, config, cardStyleId);
  drawWatermark(ctx, effectiveConfig);

  if (page.type === "cover") {
    drawCoverPage(ctx, title, subtitle, templateId, effectiveConfig, coverImage, stickerImages);
    drawSocialIcons(ctx, effectiveConfig, socialIconImages);
    return canvas;
  }
  const mutedColor = effectiveConfig.textColor.startsWith("#") ? `${effectiveConfig.textColor}AA` : "rgba(20,20,20,0.56)";

  let y = metrics.y;

  for (const lineEntry of page.lines) {
    y += lineEntry.marginTop;
    if (lineEntry.kind === "table") {
      const blockX = metrics.x + lineEntry.indent;
      const tableWidth = lineEntry.columnCount * lineEntry.columnWidth;
      const rowHeight = lineEntry.rowHeight;
      const cellPaddingX = 14;
      const cellPaddingY = 12;
      const borderColor = "rgba(0,0,0,0.16)";
      const headerBg = "rgba(0,0,0,0.05)";

      if (lineEntry.header) {
        drawRoundedRect(ctx, blockX, y, tableWidth, rowHeight, 0, headerBg);
      }

      ctx.save();
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(blockX, y, tableWidth, rowHeight);
      for (let col = 1; col < lineEntry.columnCount; col += 1) {
        const x = blockX + col * lineEntry.columnWidth;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + rowHeight);
        ctx.stroke();
      }
      ctx.restore();

      for (let col = 0; col < lineEntry.columnCount; col += 1) {
        const cellX = blockX + col * lineEntry.columnWidth;
        const lines = lineEntry.cells[col] ?? [];
        let cellY = y + cellPaddingY;
        for (const line of lines) {
          let textX = cellX + cellPaddingX;
          for (const chunk of line.chunks) {
            ctx.font = fontString(chunk.style);
            ctx.fillStyle = chunk.style.color;
            ctx.textAlign = "left";
            ctx.textBaseline = "top";

            const textWidth = measureTextWithSpacing(ctx, chunk.text, chunk.style.letterSpacing);
            if (chunk.style.highlightColor) {
              drawRoundedRect(
                ctx,
                textX - 2,
                cellY + 2,
                textWidth + 4,
                Math.max(20, chunk.style.fontSize * 1.02),
                4,
                chunk.style.highlightColor
              );
            }

            drawTextWithSpacing(ctx, chunk.text, textX, cellY, chunk.style.letterSpacing);
            textX += textWidth;
          }
          cellY += line.height;
        }
      }

      y += rowHeight;
      y += lineEntry.marginBottom;
      continue;
    }

    const textY = y;
    const blockX = metrics.x + lineEntry.indent;

    if (lineEntry.kind === "quote") {
      drawRoundedRect(ctx, metrics.x, textY + 6, 6, Math.max(10, lineEntry.line.height - 12), 3, effectiveConfig.accentColor);
    }

    let x = blockX;
    for (const chunk of lineEntry.line.chunks) {
      ctx.font = fontString(chunk.style);
      ctx.fillStyle = chunk.style.color;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";

      const textWidth = measureTextWithSpacing(ctx, chunk.text, chunk.style.letterSpacing);
      if (chunk.style.highlightColor) {
        drawRoundedRect(
          ctx,
          x - 2,
          textY + 4,
          textWidth + 4,
          Math.max(22, chunk.style.fontSize * 1.02),
          4,
          chunk.style.highlightColor
        );
      }

      drawTextWithSpacing(ctx, chunk.text, x, textY, chunk.style.letterSpacing);

      if (chunk.style.strike) {
        const strikeY = textY + chunk.style.fontSize * 0.55;
        ctx.strokeStyle = chunk.style.color;
        ctx.lineWidth = Math.max(1, chunk.style.fontSize * 0.06);
        ctx.beginPath();
        ctx.moveTo(x, strikeY);
        ctx.lineTo(x + textWidth, strikeY);
        ctx.stroke();
      }

      x += textWidth;
    }

    y += lineEntry.line.height;
    y += lineEntry.marginBottom;
  }

  if (effectiveConfig.hasSignature && effectiveConfig.signatureText.trim()) {
    ctx.fillStyle = effectiveConfig.signatureColor;
    ctx.font = `600 24px ${effectiveConfig.fontFamily}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(effectiveConfig.signatureText, metrics.x, CARD_HEIGHT - 60);
  }

  if (effectiveConfig.showPageNumber) {
    const hasCover = effectiveConfig.hasCover && totalPages > 1;
    const displayTotal = hasCover ? Math.max(1, totalPages - 1) : totalPages;
    const displayPage = hasCover ? Math.max(1, pageIndex) : pageIndex + 1;
    ctx.fillStyle = mutedColor;
    ctx.font = `500 22px ${effectiveConfig.fontFamily}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(`${displayPage} / ${displayTotal}`, CARD_WIDTH - metrics.x, CARD_HEIGHT - 60);
  }

  if (effectiveConfig.showGrid) {
    drawGridOverlay(ctx, metrics);
  }

  return canvas;
}

function getMd2CardTheme(id: string): Md2CardTheme {
  return MD2CARD_THEMES.find((theme) => theme.id === id) ?? MD2CARD_THEMES[0];
}

function getMd2CardClassName(cardStyleId: CardStyleId, modeId: CardStyleModeId): string {
  const theme = getMd2CardTheme(cardStyleId);
  const mode = theme.modes?.find((item) => item.id === modeId);
  return cn("card markdown-body", theme.className.startsWith("card-") ? theme.className : `card-${theme.className}`, mode?.className);
}

function rewriteMd2CardAssetUrls(css: string, options?: { exportSafe?: boolean }): string {
  return css.replace(/url\((['"]?)\/img\/assets\/([^'")]+)\1\)/g, (_match, quote: string, path: string) => {
    const mark = quote || "\"";
    if (path === "img/coil-bg.png") {
      return `url(${mark}${MD2CARD_COIL_BG_DATA_URL}${mark})`;
    }
    if (options?.exportSafe) return "none";
    return `url(${mark}https://md2card.com/img/assets/${path}${mark})`;
  });
}

function buildMd2CardCss(config: CardConfig, cardStyleId: CardStyleId, scale: number, options?: { exportSafe?: boolean }): string {
  const theme = getMd2CardTheme(cardStyleId);
  const width = MD2CARD_PREVIEW_WIDTH * scale;
  const height = MD2CARD_PREVIEW_HEIGHT * scale;
  const bodyFontSize = config.fontSize / 2;
  const spacing = Math.max(2, (bodyFontSize / 5) * scale);
  const themeCss = rewriteMd2CardAssetUrls(theme.css, options);
  return `
    ${MD2CARD_COMMON_CSS}
    ${themeCss}
    .md2card-preview-shell { width: ${width}px; height: ${height}px; }
    .md2card-preview-shell .card {
      width: ${width}px;
      height: ${height}px;
      --card-height: ${height}px;
      --spacing: ${spacing}px;
      box-sizing: border-box;
      overflow: hidden;
      font-family: ${config.fontFamily};
    }
    .md2card-preview-shell .card-content,
    .md2card-preview-shell .card-content-inner {
      box-sizing: border-box;
      overflow: hidden;
    }
    .md2card-preview-shell .card h1 { font-size: ${bodyFontSize * config.h1Scale * scale}px; }
    .md2card-preview-shell .card h2 { font-size: ${bodyFontSize * config.h2Scale * scale}px; }
    .md2card-preview-shell .card h3 { font-size: ${bodyFontSize * config.h3Scale * scale}px; }
    .md2card-preview-shell .card-content-inner {
      font-size: ${bodyFontSize * scale}px;
      line-height: ${config.lineHeight};
      letter-spacing: ${config.letterSpacing * scale}px;
    }
    .md2card-preview-shell .card-content-inner > p,
    .md2card-preview-shell .card-content-inner li {
      line-height: ${config.lineHeight};
      letter-spacing: ${config.letterSpacing * scale}px;
    }
    .md2card-preview-shell .card-footer .page {
      visibility: ${config.showPageNumber ? "visible" : "hidden"};
    }
  `;
}

function renderMd2CardContent(markdown: string): string {
  const html = getMarkdownParser().render(markdown ?? "");
  return `<section class="card-content-inner">${html}</section>`;
}

function renderMd2CardHtml(
  page: CardPage,
  index: number,
  total: number,
  config: CardConfig,
  cardStyleId: CardStyleId,
  cardStyleModeId: CardStyleModeId
): string {
  const theme = getMd2CardTheme(cardStyleId);
  const content = page.type === "content" ? renderMd2CardContent(page.markdown || "") : "";
  const template = theme.html || MD2CARD_DEFAULT_HTML;
  const pageText = config.showPageNumber ? `${index + 1} / ${total}` : "";
  const className = getMd2CardClassName(cardStyleId, cardStyleModeId);
  const body = template
    .replace(/{{content}}/g, content)
    .replace(/{{page}}/g, pageText)
    .replace(/{{date}}/g, new Date().toLocaleDateString("zh-CN"))
    .replace(/{{title}}/g, "");
  return `<section class="${className}">${body}</section>`;
}

function renderMd2CardPageExportHtml(
  page: CardPage,
  config: CardConfig,
  cardStyleId: CardStyleId,
  cardStyleModeId: CardStyleModeId,
  index: number,
  total: number
): string {
  const width = MD2CARD_EXPORT_WIDTH;
  const height = MD2CARD_EXPORT_HEIGHT;
  const scale = width / MD2CARD_PREVIEW_WIDTH;
  const html = renderMd2CardHtml(page, index, total, config, cardStyleId, cardStyleModeId);
  const css = buildMd2CardCss(config, cardStyleId, scale, { exportSafe: true });
  return `<!doctype html><html><head><meta charset="utf-8" /><style>html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:#fff}${css}</style></head><body><div class="md2card-preview-shell" style="width:${width}px;height:${height}px;overflow:hidden;">${html}</div></body></html>`;
}

function base64ToBlob(base64: string, mime: string): Blob {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mime });
}

async function renderMd2CardPagesForOutput(
  requests: Array<{ page: CardPage; index: number }>,
  outputFormat: ExportFormat,
  config: CardConfig,
  cardStyleId: CardStyleId,
  cardStyleModeId: CardStyleModeId,
  total: number
): Promise<Map<number, Blob>> {
  if (requests.length === 0) return new Map();
  const output = new Map<number, Blob>();
  const batchSize = 12;
  for (let start = 0; start < requests.length; start += batchSize) {
    const batch = requests.slice(start, start + batchSize);
    const response = await fetch("/api/xhs-layout/md2card-export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        format: outputFormat,
        width: MD2CARD_EXPORT_WIDTH,
        height: MD2CARD_EXPORT_HEIGHT,
        pages: batch.map(({ page, index }) => renderMd2CardPageExportHtml(page, config, cardStyleId, cardStyleModeId, index, total)),
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        typeof payload?.error === "string" && payload.error.trim()
          ? payload.error.trim()
          : "图片导出失败，请稍后重试"
      );
    }
    const mime = typeof payload?.data?.mime === "string" ? payload.data.mime : (outputFormat === "jpeg" ? "image/jpeg" : "image/png");
    const images = Array.isArray(payload?.data?.images) ? payload.data.images : [];
    if (images.length !== batch.length) {
      throw new Error("图片导出数量异常，请稍后重试");
    }
    images.forEach((item: unknown, itemIndex: number) => {
      if (typeof item === "string" && item) {
        output.set(batch[itemIndex].index, base64ToBlob(item, mime));
      }
    });
  }
  return output;
}

function Md2CardPreview({
  page,
  index,
  total,
  config,
  cardStyleId,
  cardStyleModeId,
}: {
  page: CardPage;
  index: number;
  total: number;
  config: CardConfig;
  cardStyleId: CardStyleId;
  cardStyleModeId: CardStyleModeId;
}) {
  if (page.type !== "content") return null;
  const html = renderMd2CardHtml(page, index, total, config, cardStyleId, cardStyleModeId);
  const styleText = buildMd2CardCss(config, cardStyleId, 1);
  return (
    <div
      className="h-auto w-auto rounded-md border border-border/40 shadow-sm"
      style={{
        width: MD2CARD_PREVIEW_WIDTH,
        height: MD2CARD_PREVIEW_HEIGHT,
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: styleText }} />
      <div
        className="md2card-preview-shell overflow-hidden"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

function canvasToBlob(canvas: HTMLCanvasElement, format: ExportFormat): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to generate image blob"));
          return;
        }
        resolve(blob);
      },
      format === "jpeg" ? "image/jpeg" : "image/png",
      0.94
    );
  });
}

function copyBytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function makeCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[i] = value >>> 0;
  }
  return table;
}

const CRC32_TABLE = makeCrc32Table();
const ZIP_UTF8_FLAG = 0x0800;

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date): { date: number; time: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function writeUint16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

function writeUint32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, true);
}

async function createZipBlob(files: Array<{ name: string; blob: Blob }>): Promise<Blob> {
  const encoder = new TextEncoder();
  const now = dosDateTime(new Date());
  const localParts: BlobPart[] = [];
  const centralParts: BlobPart[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const nameBuffer = copyBytesToArrayBuffer(nameBytes);
    const contentBuffer = await file.blob.arrayBuffer();
    const content = new Uint8Array(contentBuffer);
    const checksum = crc32(content);

    const localHeader = new ArrayBuffer(30);
    const localView = new DataView(localHeader);
    writeUint32(localView, 0, 0x04034b50);
    writeUint16(localView, 4, 20);
    writeUint16(localView, 6, ZIP_UTF8_FLAG);
    writeUint16(localView, 8, 0);
    writeUint16(localView, 10, now.time);
    writeUint16(localView, 12, now.date);
    writeUint32(localView, 14, checksum);
    writeUint32(localView, 18, content.length);
    writeUint32(localView, 22, content.length);
    writeUint16(localView, 26, nameBytes.length);
    writeUint16(localView, 28, 0);
    localParts.push(localHeader, nameBuffer, contentBuffer);

    const centralHeader = new ArrayBuffer(46);
    const centralView = new DataView(centralHeader);
    writeUint32(centralView, 0, 0x02014b50);
    writeUint16(centralView, 4, 20);
    writeUint16(centralView, 6, 20);
    writeUint16(centralView, 8, ZIP_UTF8_FLAG);
    writeUint16(centralView, 10, 0);
    writeUint16(centralView, 12, now.time);
    writeUint16(centralView, 14, now.date);
    writeUint32(centralView, 16, checksum);
    writeUint32(centralView, 20, content.length);
    writeUint32(centralView, 24, content.length);
    writeUint16(centralView, 28, nameBytes.length);
    writeUint16(centralView, 30, 0);
    writeUint16(centralView, 32, 0);
    writeUint16(centralView, 34, 0);
    writeUint16(centralView, 36, 0);
    writeUint32(centralView, 38, 0);
    writeUint32(centralView, 42, offset);
    centralParts.push(centralHeader, nameBuffer);

    offset += localHeader.byteLength + nameBytes.length + content.length;
  }

  const centralSize = centralParts.reduce((sum, part) => {
    if (part instanceof ArrayBuffer) return sum + part.byteLength;
    if (part instanceof Uint8Array) return sum + part.byteLength;
    return sum;
  }, 0);

  const eocd = new ArrayBuffer(22);
  const eocdView = new DataView(eocd);
  writeUint32(eocdView, 0, 0x06054b50);
  writeUint16(eocdView, 4, 0);
  writeUint16(eocdView, 6, 0);
  writeUint16(eocdView, 8, files.length);
  writeUint16(eocdView, 10, files.length);
  writeUint32(eocdView, 12, centralSize);
  writeUint32(eocdView, 16, offset);
  writeUint16(eocdView, 20, 0);

  return new Blob([...localParts, ...centralParts, eocd], { type: "application/zip" });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片渲染失败"));
    image.src = src;
  });
}

function escapeStyleForSvg(value: string): string {
  return value.replace(/<\/style/gi, "<\\/style");
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function MarkdownTextCardDialog({
  open,
  onOpenChange,
  markdown,
  filePath,
  rightPanel,
  xhsPublishMeta,
}: MarkdownTextCardDialogProps) {
  const { t, locale } = useTranslation();
  const isZh = locale === "zh";

  const [cardStyleId, setCardStyleId] = useState<CardStyleId>("apple-notes");
  const [cardStyleModeId, setCardStyleModeId] = useState<CardStyleModeId>("light-mode");
  const [templateId, setTemplateId] = useState<CardTemplateId>("ios-memo");
  const [config, setConfig] = useState<CardConfig>(() => applyCardStyleDefaults(createInitialConfig("ios-memo"), findCardStyle("apple-notes"), getFirstCardStyleMode(findCardStyle("apple-notes"))));
  const [format, setFormat] = useState<ExportFormat>("png");
  const [previewScale, setPreviewScale] = useState(100);
  const [pageIndex, setPageIndex] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [coverImageEl, setCoverImageEl] = useState<HTMLImageElement | null>(null);
  const [socialIconImages, setSocialIconImages] = useState<Partial<Record<SocialIconId, HTMLImageElement | null>>>({});
  const [coverStickerImages, setCoverStickerImages] = useState<Partial<Record<CoverStyleId, { primary: HTMLImageElement | null; secondary: HTMLImageElement | null }>>>({});
  const [coverImageName, setCoverImageName] = useState("");
  const [coverTitleEdited, setCoverTitleEdited] = useState(false);
  const [persistedHydrated, setPersistedHydrated] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishResult, setPublishResult] = useState<{
    id: string;
    url: string;
    qrcode: string;
  } | null>(null);
  const [lastPublishedKey, setLastPublishedKey] = useState("");
  const publishRequestLockRef = useRef(false);
  const isBrowser = typeof window !== "undefined";

  const currentCardStyle = useMemo(() => findCardStyle(cardStyleId), [cardStyleId]);
  const currentCardStyleMode = useMemo(() => getCardStyleMode(currentCardStyle, cardStyleModeId), [cardStyleModeId, currentCardStyle]);
  const currentTemplate = useMemo(() => findTemplate(templateId), [templateId]);
  const title = useMemo(() => getDefaultTitle(filePath), [filePath]);
  const inferredCoverTitle = useMemo(() => deriveCoverTitleFromMarkdown(markdown, title), [markdown, title]);
  const resolvedCoverText = useMemo(
    () => resolveCoverText(config.coverTitle, config.coverSubtitle, inferredCoverTitle, title),
    [config.coverTitle, config.coverSubtitle, inferredCoverTitle, title]
  );
  const cardMarkdown = useMemo(() => preprocessMarkdownForCard(markdown), [markdown]);
  const pages = useMemo(
    () => paginateMarkdown(cardMarkdown, templateId, config, cardStyleId, cardStyleModeId),
    [cardMarkdown, templateId, config, cardStyleId, cardStyleModeId]
  );

  useEffect(() => {
    const firstMode = getFirstCardStyleMode(currentCardStyle);
    if (!firstMode) {
      if (cardStyleModeId) setCardStyleModeId("");
      return;
    }
    if (!currentCardStyle.modes?.some((mode) => mode.id === cardStyleModeId)) {
      setCardStyleModeId(firstMode.id);
    }
  }, [cardStyleModeId, currentCardStyle]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const persisted = normalizePersistedCardSettings(window.localStorage.getItem(TEXT_CARD_STORAGE_KEY));
    if (persisted) {
      setCardStyleId(persisted.cardStyleId || "apple-notes");
      setCardStyleModeId(persisted.cardStyleModeId || getFirstCardStyleMode(findCardStyle(persisted.cardStyleId || "apple-notes"))?.id || "");
      setTemplateId(persisted.templateId);
      setConfig(persisted.config);
      setFormat(persisted.format);
      setPreviewScale(persisted.previewScale);
      setCoverImageName(persisted.coverImageName || "");
    }
    setPersistedHydrated(true);
  }, []);

  useEffect(() => {
    if (!persistedHydrated || typeof window === "undefined") return;
    const payload: PersistedTextCardSettings = {
      version: 1,
      cardStyleId,
      cardStyleModeId,
      templateId,
      config,
      format,
      previewScale,
      coverImageName,
    };
    try {
      window.localStorage.setItem(TEXT_CARD_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore localStorage failures
    }
  }, [persistedHydrated, cardStyleId, cardStyleModeId, templateId, config, format, previewScale, coverImageName]);

  useEffect(() => {
    if (!open) return;
    setCoverTitleEdited(false);
  }, [open, markdown, filePath]);

  useEffect(() => {
    if (!open || coverTitleEdited) return;
    setConfig((prev) => {
      const next = inferredCoverTitle.trim();
      if (!next || prev.coverTitle === next) return prev;
      return { ...prev, coverTitle: next };
    });
  }, [open, coverTitleEdited, inferredCoverTitle]);

  useEffect(() => {
    if (!config.coverImage) {
      setCoverImageEl(null);
      return;
    }
    const img = new Image();
    img.onload = () => setCoverImageEl(img);
    img.onerror = () => setCoverImageEl(null);
    img.src = config.coverImage;
  }, [config.coverImage]);

  useEffect(() => {
    let cancelled = false;
    const selected = config.selectedSocialIcons;
    if (!config.hasSocialIcons || selected.length === 0) {
      setSocialIconImages({});
      return () => {
        cancelled = true;
      };
    }

    const loaders = selected.map((id) => new Promise<{ id: SocialIconId; img: HTMLImageElement | null }>((resolve) => {
      const meta = SOCIAL_ICON_OPTIONS.find((it) => it.id === id);
      if (!meta) {
        resolve({ id, img: null });
        return;
      }
      const img = new Image();
      img.onload = () => resolve({ id, img });
      img.onerror = () => resolve({ id, img: null });
      img.src = meta.src;
    }));

    Promise.all(loaders).then((results) => {
      if (cancelled) return;
      const mapped: Partial<Record<SocialIconId, HTMLImageElement | null>> = {};
      for (const result of results) mapped[result.id] = result.img;
      setSocialIconImages(mapped);
    });

    return () => {
      cancelled = true;
    };
  }, [config.hasSocialIcons, config.selectedSocialIcons]);

  useEffect(() => {
    let cancelled = false;
    const stylesWithAssets = COVER_STYLE_SPECS.filter((style) => style.stickerAsset || style.stickerAssetSecondary);
    if (stylesWithAssets.length === 0) {
      setCoverStickerImages({});
      return () => {
        cancelled = true;
      };
    }

    const loadImage = (src?: string) => new Promise<HTMLImageElement | null>((resolve) => {
      if (!src) {
        resolve(null);
        return;
      }
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });

    Promise.all(stylesWithAssets.map(async (style) => {
      const [primary, secondary] = await Promise.all([loadImage(style.stickerAsset), loadImage(style.stickerAssetSecondary)]);
      return { id: style.id, primary, secondary };
    })).then((results) => {
      if (cancelled) return;
      const mapped: Partial<Record<CoverStyleId, { primary: HTMLImageElement | null; secondary: HTMLImageElement | null }>> = {};
      for (const result of results) {
        mapped[result.id] = { primary: result.primary, secondary: result.secondary };
      }
      setCoverStickerImages(mapped);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const coverPreviewDataUrl = useMemo(() => {
    if (!isBrowser) return "";
    if (pages.length === 0) return "";
    const idx = Math.max(0, Math.min(pageIndex, pages.length - 1));
    if (pages[idx]?.type !== "cover") return "";
    const canvas = renderPageCanvas(
      pages[idx],
      resolvedCoverText.title,
      resolvedCoverText.subtitle,
      templateId,
      config,
      cardStyleId,
      idx,
      pages.length,
      coverImageEl,
      socialIconImages,
      coverStickerImages
    );
    return canvas.toDataURL("image/png");
  }, [isBrowser, pageIndex, pages, resolvedCoverText, templateId, config, cardStyleId, coverImageEl, socialIconImages, coverStickerImages]);

  const publishTitle = useMemo(() => {
    const fallback = sanitizeCoverTitleCandidate(resolvedCoverText.title || title);
    const raw = sanitizeCoverTitleCandidate(xhsPublishMeta?.title || fallback || title);
    return truncateXhsTitle(raw) || "小红书图文";
  }, [resolvedCoverText.title, title, xhsPublishMeta?.title]);

  const publishTags = useMemo(
    () => dedupeTags(Array.isArray(xhsPublishMeta?.tags) ? xhsPublishMeta.tags : []).slice(0, 8),
    [xhsPublishMeta?.tags]
  );

  const publishContent = useMemo(() => {
    const bodyText = typeof xhsPublishMeta?.body === "string" ? sanitizeXhsPublishBody(xhsPublishMeta.body) : "";
    const hashLine = publishTags.map((tag) => `#${normalizeTagText(tag)}`).filter(Boolean).join(" ");
    const fallback = bodyText || sanitizeCoverTitleCandidate(resolvedCoverText.subtitle || resolvedCoverText.title) || publishTitle;
    return [fallback, hashLine].filter(Boolean).join("\n\n").slice(0, 1000);
  }, [publishTags, publishTitle, resolvedCoverText.subtitle, resolvedCoverText.title, xhsPublishMeta?.body]);

  const publishCacheKey = useMemo(
    () =>
      JSON.stringify({
        title: publishTitle,
        content: publishContent,
        tags: publishTags,
        templateId,
        config,
        markdown: cardMarkdown,
        pageCount: pages.length,
      }),
    [publishTitle, publishContent, publishTags, templateId, config, cardMarkdown, pages.length]
  );

  const coverStyleThumbs = useMemo(() => {
    if (!isBrowser) return [];
    if (!config.hasCover) return [];
    const targetPage = pages.find((p) => p.type === "cover");
    if (!targetPage) return [];
    return COVER_STYLE_SPECS.map((style) => {
      const nextConfig = applyCoverStyleDefaults(config, style);
      const canvas = renderPageCanvas(
        targetPage,
        resolvedCoverText.title,
        resolvedCoverText.subtitle,
        templateId,
        nextConfig,
        cardStyleId,
        0,
        Math.max(1, pages.length),
        coverImageEl,
        socialIconImages,
        coverStickerImages
      );
      return { id: style.id, dataUrl: canvas.toDataURL("image/png"), label: isZh ? style.nameZh : style.nameEn };
    });
  }, [isBrowser, config, pages, resolvedCoverText, templateId, cardStyleId, coverImageEl, socialIconImages, coverStickerImages, isZh]);

  const canExport = pages.length > 0 && !exporting;
  const safePageIndex = Math.max(0, Math.min(pageIndex, Math.max(0, pages.length - 1)));

  const handleCardStyleChange = (nextId: CardStyleId) => {
    const style = findCardStyle(nextId);
    const firstMode = getFirstCardStyleMode(style);
    setCardStyleId(style.id);
    setCardStyleModeId(firstMode?.id || "");
    setTemplateId(style.backendTemplateId);
    setConfig((prev) => applyCardStyleDefaults(prev, style, firstMode));
    setPageIndex(0);
  };

  const handleCardStyleModeChange = (nextModeId: CardStyleModeId) => {
    const mode = getCardStyleMode(currentCardStyle, nextModeId);
    setCardStyleModeId(mode?.id || "");
    setConfig((prev) => applyCardStyleDefaults(prev, currentCardStyle, mode));
    setPageIndex(0);
  };

  const handleCoverStyleChange = (nextId: CoverStyleId) => {
    setConfig((prev) => applyCoverStyleDefaults(prev, findCoverStyle(nextId)));
    setPageIndex(0);
  };

  const handleCoverImageUpload: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      setConfig((prev) => ({ ...prev, coverImage: result }));
      setCoverImageName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const toggleSocialIcon = (id: SocialIconId) => {
    setConfig((prev) => {
      const exists = prev.selectedSocialIcons.includes(id);
      const next = exists
        ? prev.selectedSocialIcons.filter((it) => it !== id)
        : [...prev.selectedSocialIcons, id];
      return { ...prev, selectedSocialIcons: next.slice(0, 6) };
    });
  };

  const renderCoverPageForOutput = async (page: CardPage, index: number, outputFormat: ExportFormat): Promise<Blob> => {
    if (page.type === "cover") {
      const canvas = renderPageCanvas(
        page,
        resolvedCoverText.title,
        resolvedCoverText.subtitle,
        templateId,
        config,
        cardStyleId,
        index,
        pages.length,
        coverImageEl,
        socialIconImages,
        coverStickerImages
      );
      return canvasToBlob(canvas, outputFormat);
    }
    throw new Error("当前页不是封面");
  };

  const handleExportCurrent = async () => {
    if (!canExport) return;
    setExporting(true);
    try {
      const idx = Math.max(0, Math.min(pageIndex, pages.length - 1));
      const blob = pages[idx].type === "cover"
        ? await renderCoverPageForOutput(pages[idx], idx, format)
        : (await renderMd2CardPagesForOutput(
            [{ page: pages[idx], index: idx }],
            format,
            config,
            cardStyleId,
            cardStyleModeId,
            pages.length
          )).get(idx);
      if (!blob) throw new Error("图片导出失败，请稍后重试");
      const base = sanitizeFileName(title);
      triggerDownload(blob, `${base}-${String(idx + 1).padStart(2, "0")}.${format === "jpeg" ? "jpg" : "png"}`);
    } finally {
      setExporting(false);
    }
  };

  const handleExportAll = async () => {
    if (!canExport) return;
    setExporting(true);
    try {
      const base = sanitizeFileName(title);
      const ext = format === "jpeg" ? "jpg" : "png";
      const files: Array<{ name: string; blob: Blob }> = [];
      const contentBlobs = await renderMd2CardPagesForOutput(
        pages
          .map((page, index) => ({ page, index }))
          .filter((item) => item.page.type === "content"),
        format,
        config,
        cardStyleId,
        cardStyleModeId,
        pages.length
      );
      for (let i = 0; i < pages.length; i += 1) {
        const blob = pages[i].type === "cover"
          ? await renderCoverPageForOutput(pages[i], i, format)
          : contentBlobs.get(i);
        if (!blob) throw new Error("图片导出失败，请稍后重试");
        files.push({
          name: `${base}-${String(i + 1).padStart(2, "0")}.${ext}`,
          blob,
        });
      }
      const zip = await createZipBlob(files);
      triggerDownload(zip, `${base}-${format}-pages.zip`);
    } finally {
      setExporting(false);
    }
  };

  const handlePublishToXhs = async () => {
    if (publishRequestLockRef.current || isPublishing || pages.length === 0) return;
    if (publishResult && lastPublishedKey && lastPublishedKey === publishCacheKey) {
      setPublishError("");
      setPublishDialogOpen(true);
      return;
    }
    publishRequestLockRef.current = true;
    setPublishError("");
    setIsPublishing(true);
    try {
      const baseName = sanitizeFileName(title);
      const pagesToPublish = pages.slice(0, 18);
      const imageUrls: string[] = [];
      const publishContentBlobs = await renderMd2CardPagesForOutput(
        pagesToPublish
          .map((page, index) => ({ page, index }))
          .filter((item) => item.page.type === "content"),
        "png",
        config,
        cardStyleId,
        cardStyleModeId,
        pages.length
      );

      for (let i = 0; i < pagesToPublish.length; i += 1) {
        const blob = pagesToPublish[i].type === "cover"
          ? await renderCoverPageForOutput(pagesToPublish[i], i, "png")
          : publishContentBlobs.get(i);
        if (!blob) throw new Error("图片生成失败，请稍后重试");
        const file = new File([blob], `${baseName}-${String(i + 1).padStart(2, "0")}.png`, { type: "image/png" });
        const formData = new FormData();
        formData.append("file", file);
        formData.append("type", "storyboard");

        const uploadResponse = await fetch("/api/upload/image", {
          method: "POST",
          body: formData,
        });
        const uploadPayload = await uploadResponse.json().catch(() => null);
        const uploadedUrl = typeof uploadPayload?.url === "string" ? uploadPayload.url.trim() : "";
        if (!uploadResponse.ok || !uploadedUrl) {
          throw new Error(
            typeof uploadPayload?.error === "string" && uploadPayload.error.trim()
              ? uploadPayload.error.trim()
              : "图片上传失败，请稍后重试"
          );
        }
        imageUrls.push(uploadedUrl);
      }

      if (imageUrls.length === 0) {
        throw new Error("未生成可发布图片，请先检查排版预览");
      }

      const publishResponse = await fetch("/api/xhs-layout/publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "normal",
          title: publishTitle,
          content: publishContent,
          images: imageUrls,
        }),
      });
      const publishPayload = await publishResponse.json().catch(() => null);
      const data = publishPayload?.data;
      const qrcode = typeof data?.qrcode === "string" ? data.qrcode : "";
      const url = typeof data?.url === "string" ? data.url : "";
      const id = typeof data?.id === "string" ? data.id : "";

      if (!publishResponse.ok || !qrcode || !url || !id) {
        throw new Error(
          typeof publishPayload?.error === "string" && publishPayload.error.trim()
            ? publishPayload.error.trim()
            : "发布二维码生成失败，请稍后重试"
        );
      }

      setPublishResult({ id, url, qrcode });
      setLastPublishedKey(publishCacheKey);
      setPublishDialogOpen(true);
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : "发布失败，请稍后重试");
    } finally {
      setIsPublishing(false);
      publishRequestLockRef.current = false;
    }
  };

  useEffect(() => {
    if (!open) {
      setIsPublishing(false);
      setPublishError("");
      setPublishDialogOpen(false);
      setPublishResult(null);
      setLastPublishedKey("");
      publishRequestLockRef.current = false;
    }
  }, [open]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="relative !w-[min(1800px,99vw)] !max-w-[min(1800px,99vw)] sm:!max-w-[min(1800px,99vw)] h-[96vh] max-h-[96vh] overflow-hidden flex flex-col gap-3 px-3 sm:px-4">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label={isZh ? "关闭弹窗" : "Close dialog"}
            className="absolute right-7 top-5 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:text-foreground"
          >
            <X size={16} />
          </button>
          <DialogHeader>
            <DialogTitle>{t("docPreview.textCardTitle")}</DialogTitle>
            <DialogDescription>{t("docPreview.textCardDesc")}</DialogDescription>
          </DialogHeader>

        <div
          className={[
            "grid gap-3 xl:gap-4 flex-1 min-h-0",
            rightPanel
              ? "md:grid-cols-[420px_minmax(0,0.86fr)_420px]"
              : "md:grid-cols-[440px_minmax(0,0.9fr)]",
          ].join(" ")}
        >
          <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-4 overflow-y-auto min-w-0">
            <div className="rounded-md border border-border/50 bg-background/80 p-3 text-xs">
              <p className="font-medium text-foreground">{isZh ? currentCardStyle.titleZh : currentCardStyle.titleEn}</p>
              <p className="mt-1 text-muted-foreground">
                {isZh ? currentCardStyle.descZh : currentCardStyle.descEn}
                {currentCardStyleMode ? ` · ${isZh ? currentCardStyleMode.titleZh : currentCardStyleMode.titleEn}` : ""}
              </p>
              <p className="mt-1 text-muted-foreground">
                {isZh ? "底层模板" : "Render template"}: {isZh ? currentTemplate.nameZh : currentTemplate.nameEn}
              </p>
              <p className="mt-2 text-muted-foreground">{t("docPreview.textCardPageCount", { count: pages.length })}</p>
              <p className="text-muted-foreground">{t("docPreview.textCardResolution")}</p>
            </div>

            <div>
              <p className="text-xs mb-2 text-muted-foreground">{isZh ? "风格主题" : "Style Theme"}</p>
              <div className="grid grid-cols-2 gap-2">
                {CARD_LAYOUT_STYLES.map((style) => {
                  const active = cardStyleId === style.id;
                  const displayMode = active ? getCardStyleMode(style, cardStyleModeId) : getFirstCardStyleMode(style);
                  const previewBackground = displayMode?.previewBackground || style.previewBackground;
                  const previewColors = displayMode?.colors || style.colors;
                  return (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => handleCardStyleChange(style.id)}
                      className={[
                        "rounded-lg border p-2 text-left transition",
                        active ? "border-primary bg-primary/10 ring-2 ring-primary/20" : "border-border/60 bg-background/80 hover:border-border",
                      ].join(" ")}
                    >
                      <div className="h-12 rounded-md border border-border/40" style={{ background: previewBackground }} />
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-xs font-semibold text-foreground">{isZh ? style.titleZh : style.titleEn}</p>
                        <div className="flex shrink-0 gap-1">
                          {previewColors.slice(0, 3).map((color, index) => (
                            <span
                              key={`${style.id}-${color}-${index}`}
                              className="h-3 w-3 rounded-full border border-black/10"
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                      </div>
                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{isZh ? style.descZh : style.descEn}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {currentCardStyle.modes && currentCardStyle.modes.length > 0 ? (
              <div className="rounded-lg border border-border/60 bg-background/80 p-3 space-y-2">
                <p className="text-xs text-muted-foreground">{isZh ? "风格模式" : "Style Mode"}</p>
                <div className="grid grid-cols-2 gap-2">
                  {currentCardStyle.modes.map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => handleCardStyleModeChange(mode.id)}
                      className={[
                        "rounded-md border px-2 py-2 text-left transition",
                        currentCardStyleMode?.id === mode.id ? "border-primary bg-primary/10" : "border-border/60 hover:border-border",
                      ].join(" ")}
                    >
                      <div className="mb-1 h-5 rounded" style={{ background: mode.previewBackground }} />
                      <p className="truncate text-[11px] font-medium">{isZh ? mode.titleZh : mode.titleEn}</p>
                      <p className="truncate text-[10px] text-muted-foreground">{isZh ? mode.descZh : mode.descEn}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="rounded-lg border border-border/60 bg-background/80 p-3 space-y-3">
              <p className="text-sm font-semibold">{isZh ? "基础配置" : "Basic Config"}</p>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  variant={config.bgMode === "solid" ? "default" : "outline"}
                  onClick={() => setConfig((prev) => ({ ...prev, bgMode: "solid" }))}
                >
                  {isZh ? "纯色背景" : "Solid"}
                </Button>
                <Button
                  size="sm"
                  variant={config.bgMode === "gradient" ? "default" : "outline"}
                  onClick={() => setConfig((prev) => ({ ...prev, bgMode: "gradient" }))}
                >
                  {isZh ? "渐变背景" : "Gradient"}
                </Button>
              </div>

              {config.bgMode === "solid" ? (
                <>
                  <label className="flex items-center justify-between text-xs gap-2">
                    <span>{isZh ? "背景色" : "Background"}</span>
                    <input
                      type="color"
                      value={config.bgColor}
                      onChange={(e) => setConfig((prev) => ({ ...prev, bgColor: e.target.value }))}
                      className="h-8 w-14 rounded border border-border bg-transparent"
                    />
                  </label>
                  <div className="grid grid-cols-6 gap-1.5">
                    {SOLID_BG_PRESETS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        title={color}
                        aria-label={color}
                        onClick={() => setConfig((prev) => ({ ...prev, bgColor: color }))}
                        className={`h-6 rounded border ${config.bgColor.toLowerCase() === color.toLowerCase() ? "ring-2 ring-ring" : "border-border/50"}`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <label className="flex items-center justify-between text-xs gap-2">
                    <span>{isZh ? "渐变起始" : "Gradient Start"}</span>
                    <input
                      type="color"
                      value={config.gradientStart}
                      onChange={(e) => setConfig((prev) => ({ ...prev, gradientStart: e.target.value }))}
                      className="h-8 w-14 rounded border border-border bg-transparent"
                    />
                  </label>
                  <label className="flex items-center justify-between text-xs gap-2">
                    <span>{isZh ? "渐变结束" : "Gradient End"}</span>
                    <input
                      type="color"
                      value={config.gradientEnd}
                      onChange={(e) => setConfig((prev) => ({ ...prev, gradientEnd: e.target.value }))}
                      className="h-8 w-14 rounded border border-border bg-transparent"
                    />
                  </label>
                  <label className="text-xs block">
                    <div className="flex items-center justify-between"><span>{isZh ? "渐变角度" : "Gradient Angle"}</span><span>{config.gradientAngle}°</span></div>
                    <input
                      type="range"
                      min={0}
                      max={360}
                      value={config.gradientAngle}
                      onChange={(e) => setConfig((prev) => ({ ...prev, gradientAngle: Number(e.target.value) }))}
                      className="w-full"
                    />
                  </label>
                  <div className="grid grid-cols-6 gap-1.5">
                    {GRADIENT_PRESETS.map((grad) => {
                      const key = `${grad.start}-${grad.end}-${grad.angle}`;
                      return (
                        <button
                          key={key}
                          type="button"
                          title={key}
                          aria-label={key}
                          onClick={() => setConfig((prev) => ({ ...prev, gradientStart: grad.start, gradientEnd: grad.end, gradientAngle: grad.angle }))}
                          className="h-6 rounded border border-border/50"
                          style={{ background: `linear-gradient(${grad.angle}deg, ${grad.start} 0%, ${grad.end} 100%)` }}
                        />
                      );
                    })}
                  </div>
                </>
              )}

              <label className="flex items-center justify-between text-xs gap-2">
                <span>{isZh ? "正文颜色" : "Text Color"}</span>
                <input
                  type="color"
                  value={config.textColor}
                  onChange={(e) => setConfig((prev) => ({ ...prev, textColor: e.target.value }))}
                  className="h-8 w-14 rounded border border-border bg-transparent"
                />
              </label>
              <div className="grid grid-cols-8 gap-1.5">
                {TEXT_COLOR_PRESETS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    title={color}
                    aria-label={color}
                    onClick={() => setConfig((prev) => ({ ...prev, textColor: color }))}
                    className={`h-5 rounded border ${config.textColor.toLowerCase() === color.toLowerCase() ? "ring-2 ring-ring" : "border-border/50"}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <label className="flex items-center justify-between text-xs gap-2">
                <span>{isZh ? "强调颜色" : "Accent Color"}</span>
                <input
                  type="color"
                  value={config.accentColor}
                  onChange={(e) => setConfig((prev) => ({ ...prev, accentColor: e.target.value }))}
                  className="h-8 w-14 rounded border border-border bg-transparent"
                />
              </label>
              <div className="grid grid-cols-10 gap-1.5">
                {ACCENT_COLOR_PRESETS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    title={color}
                    aria-label={color}
                    onClick={() => setConfig((prev) => ({ ...prev, accentColor: color }))}
                    className={`h-5 rounded border ${config.accentColor.toLowerCase() === color.toLowerCase() ? "ring-2 ring-ring" : "border-border/50"}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>

              <label className="text-xs block">
                <div className="flex items-center justify-between"><span>{isZh ? "字体大小" : "Font Size"}</span><span>{config.fontSize}px</span></div>
                <input
                  type="range"
                  min={24}
                  max={56}
                  value={config.fontSize}
                  onChange={(e) => setConfig((prev) => ({ ...prev, fontSize: Number(e.target.value) }))}
                  className="w-full"
                />
              </label>

              <label className="text-xs block">
                <div className="flex items-center justify-between"><span>{isZh ? "行高" : "Line Height"}</span><span>{config.lineHeight.toFixed(2)}</span></div>
                <input
                  type="range"
                  min={1.2}
                  max={2.2}
                  step={0.05}
                  value={config.lineHeight}
                  onChange={(e) => setConfig((prev) => ({ ...prev, lineHeight: Number(e.target.value) }))}
                  className="w-full"
                />
              </label>

              <label className="text-xs block">
                <div className="flex items-center justify-between"><span>{isZh ? "字间距" : "Letter Spacing"}</span><span>{config.letterSpacing.toFixed(1)}px</span></div>
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={0.1}
                  value={config.letterSpacing}
                  onChange={(e) => setConfig((prev) => ({ ...prev, letterSpacing: Number(e.target.value) }))}
                  className="w-full"
                />
              </label>

              <label className="text-xs block">
                <div className="flex items-center justify-between"><span>{isZh ? "内边距" : "Text Padding"}</span><span>{config.textPadding}px</span></div>
                <input
                  type="range"
                  min={20}
                  max={80}
                  step={2}
                  value={config.textPadding}
                  onChange={(e) => setConfig((prev) => ({ ...prev, textPadding: Number(e.target.value) }))}
                  className="w-full"
                />
              </label>

              <label className="text-xs block">
                <span>{isZh ? "字体族" : "Font Family"}</span>
                <select
                  className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-xs"
                  value={config.fontFamily}
                  onChange={(e) => setConfig((prev) => ({ ...prev, fontFamily: e.target.value }))}
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>{isZh ? f.labelZh : f.labelEn}</option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-3 gap-2">
                <label className="text-xs block">
                  <div className="flex items-center justify-between"><span>H1</span><span>{config.h1Scale.toFixed(1)}x</span></div>
                  <input type="range" min={1.0} max={3.0} step={0.1} value={config.h1Scale} onChange={(e) => setConfig((prev) => ({ ...prev, h1Scale: Number(e.target.value) }))} className="w-full" />
                </label>
                <label className="text-xs block">
                  <div className="flex items-center justify-between"><span>H2</span><span>{config.h2Scale.toFixed(1)}x</span></div>
                  <input type="range" min={1.0} max={2.5} step={0.1} value={config.h2Scale} onChange={(e) => setConfig((prev) => ({ ...prev, h2Scale: Number(e.target.value) }))} className="w-full" />
                </label>
                <label className="text-xs block">
                  <div className="flex items-center justify-between"><span>H3</span><span>{config.h3Scale.toFixed(1)}x</span></div>
                  <input type="range" min={1.0} max={2.0} step={0.1} value={config.h3Scale} onChange={(e) => setConfig((prev) => ({ ...prev, h3Scale: Number(e.target.value) }))} className="w-full" />
                </label>
              </div>

              <label className="flex items-center justify-between text-xs">
                <span>{isZh ? "网格辅助线" : "Grid Guide"}</span>
                <input type="checkbox" checked={config.showGrid} onChange={(e) => setConfig((prev) => ({ ...prev, showGrid: e.target.checked }))} />
              </label>

              <label className="flex items-center justify-between text-xs">
                <span>{isZh ? "显示页码" : "Show Page Number"}</span>
                <input type="checkbox" checked={config.showPageNumber} onChange={(e) => setConfig((prev) => ({ ...prev, showPageNumber: e.target.checked }))} />
              </label>

              <label className="flex items-center justify-between text-xs">
                <span>{isZh ? "背景水印" : "Watermark"}</span>
                <input type="checkbox" checked={config.hasWatermark} onChange={(e) => setConfig((prev) => ({ ...prev, hasWatermark: e.target.checked }))} />
              </label>
              {config.hasWatermark && (
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <input
                    type="text"
                    className="rounded border border-border bg-background px-2 py-1 text-xs"
                    placeholder={isZh ? "水印文字" : "Watermark text"}
                    value={config.watermarkText}
                    onChange={(e) => setConfig((prev) => ({ ...prev, watermarkText: e.target.value }))}
                  />
                  <input
                    type="color"
                    value={config.watermarkColor.startsWith("#") ? config.watermarkColor : "#999999"}
                    onChange={(e) => setConfig((prev) => ({ ...prev, watermarkColor: e.target.value }))}
                    className="h-8 w-12 rounded border border-border bg-transparent"
                  />
                </div>
              )}

              <label className="flex items-center justify-between text-xs">
                <span>{isZh ? "签名栏" : "Signature"}</span>
                <input type="checkbox" checked={config.hasSignature} onChange={(e) => setConfig((prev) => ({ ...prev, hasSignature: e.target.checked }))} />
              </label>
              {config.hasSignature && (
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <input
                    type="text"
                    className="rounded border border-border bg-background px-2 py-1 text-xs"
                    placeholder={isZh ? "签名内容" : "Signature text"}
                    value={config.signatureText}
                    onChange={(e) => setConfig((prev) => ({ ...prev, signatureText: e.target.value }))}
                  />
                  <input
                    type="color"
                    value={config.signatureColor}
                    onChange={(e) => setConfig((prev) => ({ ...prev, signatureColor: e.target.value }))}
                    className="h-8 w-12 rounded border border-border bg-transparent"
                  />
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border/60 bg-background/80 p-3 space-y-3">
              <p className="text-sm font-semibold">{isZh ? "封面配置" : "Cover Config"}</p>

              <label className="flex items-center justify-between text-xs">
                <span>{isZh ? "启用封面" : "Enable Cover"}</span>
                <input
                  type="checkbox"
                  checked={config.hasCover}
                  onChange={(e) => setConfig((prev) => ({ ...prev, hasCover: e.target.checked }))}
                />
              </label>

              {config.hasCover && (
                <>
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">{isZh ? "封面风格模板" : "Cover Style Templates"}</p>
                    <div className="flex gap-2 overflow-x-auto pb-1 snap-x">
                      {COVER_STYLE_SPECS.map((style) => {
                        const active = config.coverStyleId === style.id;
                        return (
                          <button
                            key={style.id}
                            type="button"
                            className={`snap-start min-w-[110px] rounded-lg border p-1.5 text-left transition ${active ? "border-primary ring-2 ring-primary/30" : "border-border/60 hover:border-border"}`}
                            onClick={() => handleCoverStyleChange(style.id)}
                          >
                            <div
                              className="h-16 w-full rounded-md border border-border/50"
                              style={{ background: drawCoverStylePreview(style) }}
                            />
                            <p className="mt-1 text-[11px] font-medium truncate">{isZh ? style.nameZh : style.nameEn}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <textarea
                    className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs"
                    rows={3}
                    placeholder={isZh ? "封面标题（支持换行）" : "Cover title (supports line breaks)"}
                    value={config.coverTitle}
                    onChange={(e) => {
                      setCoverTitleEdited(true);
                      setConfig((prev) => ({ ...prev, coverTitle: e.target.value }));
                    }}
                  />

                  <textarea
                    className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs"
                    rows={2}
                    placeholder={isZh ? "封面副标题（可选）" : "Cover subtitle (optional)"}
                    value={config.coverSubtitle}
                    onChange={(e) => {
                      setConfig((prev) => ({ ...prev, coverSubtitle: e.target.value }));
                    }}
                  />

                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center justify-center rounded border border-border px-3 py-1.5 text-xs cursor-pointer hover:bg-muted">
                      {isZh ? "上传封面图" : "Upload Cover"}
                      <input type="file" accept="image/*" onChange={handleCoverImageUpload} className="hidden" />
                    </label>
                    <span className="text-[11px] text-muted-foreground truncate">{coverImageName || (isZh ? "未上传，使用默认" : "No upload, using default")}</span>
                  </div>

                  <label className="flex items-center justify-between text-xs">
                    <span>{isZh ? "封面贴纸" : "Cover Stickers"}</span>
                    <input
                      type="checkbox"
                      checked={config.coverShowStickers}
                      onChange={(e) => setConfig((prev) => ({ ...prev, coverShowStickers: e.target.checked }))}
                    />
                  </label>

                  <label className="flex items-center justify-between text-xs gap-2">
                    <span>{isZh ? "封面文字色" : "Cover Text Color"}</span>
                    <input
                      type="color"
                      value={config.coverTextColor}
                      onChange={(e) => setConfig((prev) => ({ ...prev, coverTextColor: e.target.value }))}
                      className="h-8 w-14 rounded border border-border bg-transparent"
                    />
                  </label>

                  <label className="flex items-center justify-between text-xs gap-2">
                    <span>{isZh ? "高亮笔刷色" : "Marker Color"}</span>
                    <input
                      type="color"
                      value={config.coverHighlightColor}
                      onChange={(e) => setConfig((prev) => ({ ...prev, coverHighlightColor: e.target.value }))}
                      className="h-8 w-14 rounded border border-border bg-transparent"
                    />
                  </label>

                  <label className="text-xs block">
                    <div className="flex items-center justify-between"><span>{isZh ? "卡片圆角" : "Card Radius"}</span><span>{config.coverCardRadius}px</span></div>
                    <input
                      type="range"
                      min={0}
                      max={64}
                      value={config.coverCardRadius}
                      onChange={(e) => setConfig((prev) => ({ ...prev, coverCardRadius: Number(e.target.value) }))}
                      className="w-full"
                    />
                  </label>

                  <label className="text-xs block">
                    <div className="flex items-center justify-between"><span>{isZh ? "主标题字号" : "Title Font Size"}</span><span>{config.coverFontSize}px</span></div>
                    <input
                      type="range"
                      min={28}
                      max={220}
                      value={config.coverFontSize}
                      onChange={(e) => setConfig((prev) => ({ ...prev, coverFontSize: Number(e.target.value) }))}
                      className="w-full"
                    />
                  </label>

                  <label className="text-xs block">
                    <div className="flex items-center justify-between"><span>{isZh ? "副标题字号" : "Subtitle Font Size"}</span><span>{config.coverSubtitleFontSize}px</span></div>
                    <input
                      type="range"
                      min={22}
                      max={180}
                      value={config.coverSubtitleFontSize}
                      onChange={(e) => setConfig((prev) => ({ ...prev, coverSubtitleFontSize: Number(e.target.value) }))}
                      className="w-full"
                    />
                  </label>

                  <label className="text-xs block">
                    <span>{isZh ? "封面标题字体" : "Cover Title Font"}</span>
                    <select
                      className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-xs"
                      value={config.coverFontFamily}
                      onChange={(e) => setConfig((prev) => ({ ...prev, coverFontFamily: e.target.value }))}
                    >
                      {COVER_FONT_OPTIONS.map((f) => (
                        <option key={f.value} value={f.value}>{isZh ? f.labelZh : f.labelEn}</option>
                      ))}
                    </select>
                  </label>

                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        size="sm"
                        variant={config.coverTitleAlignX === "left" ? "default" : "outline"}
                        onClick={() => setConfig((prev) => ({ ...prev, coverTitleAlignX: "left" }))}
                      >
                        {isZh ? "左对齐" : "Left"}
                      </Button>
                      <Button
                        size="sm"
                        variant={config.coverTitleAlignX === "center" ? "default" : "outline"}
                        onClick={() => setConfig((prev) => ({ ...prev, coverTitleAlignX: "center" }))}
                      >
                        {isZh ? "居中" : "Center"}
                      </Button>
                      <Button
                        size="sm"
                        variant={config.coverTitleAlignX === "right" ? "default" : "outline"}
                        onClick={() => setConfig((prev) => ({ ...prev, coverTitleAlignX: "right" }))}
                      >
                        {isZh ? "右对齐" : "Right"}
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        size="sm"
                        variant={config.coverTitleAlignY === "top" ? "default" : "outline"}
                        onClick={() => setConfig((prev) => ({ ...prev, coverTitleAlignY: "top" }))}
                      >
                        {isZh ? "上对齐" : "Top"}
                      </Button>
                      <Button
                        size="sm"
                        variant={config.coverTitleAlignY === "center" ? "default" : "outline"}
                        onClick={() => setConfig((prev) => ({ ...prev, coverTitleAlignY: "center" }))}
                      >
                        {isZh ? "垂直居中" : "Middle"}
                      </Button>
                      <Button
                        size="sm"
                        variant={config.coverTitleAlignY === "bottom" ? "default" : "outline"}
                        onClick={() => setConfig((prev) => ({ ...prev, coverTitleAlignY: "bottom" }))}
                      >
                        {isZh ? "下对齐" : "Bottom"}
                      </Button>
                    </div>
                  </div>

                  <label className="text-xs block">
                    <div className="flex items-center justify-between"><span>{isZh ? "封面行高" : "Cover Line Height"}</span><span>{config.coverLineHeight.toFixed(2)}</span></div>
                    <input
                      type="range"
                      min={1.1}
                      max={2.0}
                      step={0.05}
                      value={config.coverLineHeight}
                      onChange={(e) => setConfig((prev) => ({ ...prev, coverLineHeight: Number(e.target.value) }))}
                      className="w-full"
                    />
                  </label>

                  <label className="flex items-center justify-between text-xs">
                    <span>{isZh ? "社交图标" : "Social Icons"}</span>
                    <input
                      type="checkbox"
                      checked={config.hasSocialIcons}
                      onChange={(e) => setConfig((prev) => ({ ...prev, hasSocialIcons: e.target.checked }))}
                    />
                  </label>

                  {config.hasSocialIcons && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          size="sm"
                          variant={config.socialIconPosition === "top-right" ? "default" : "outline"}
                          onClick={() => setConfig((prev) => ({ ...prev, socialIconPosition: "top-right" }))}
                        >
                          {isZh ? "右上角" : "Top Right"}
                        </Button>
                        <Button
                          size="sm"
                          variant={config.socialIconPosition === "bottom-center" ? "default" : "outline"}
                          onClick={() => setConfig((prev) => ({ ...prev, socialIconPosition: "bottom-center" }))}
                        >
                          {isZh ? "底部居中" : "Bottom Center"}
                        </Button>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        {SOCIAL_ICON_OPTIONS.map((item) => {
                          const active = config.selectedSocialIcons.includes(item.id);
                          return (
                            <Button
                              key={item.id}
                              size="sm"
                              variant={active ? "default" : "outline"}
                              className="justify-center"
                              onClick={() => toggleSocialIcon(item.id)}
                            >
                              {isZh ? item.labelZh : item.labelEn}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div>
              <p className="text-xs mb-2 text-muted-foreground">{t("docPreview.textCardFormat")}</p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant={format === "png" ? "default" : "outline"} size="sm" onClick={() => setFormat("png")}>
                  PNG
                </Button>
                <Button variant={format === "jpeg" ? "default" : "outline"} size="sm" onClick={() => setFormat("jpeg")}>
                  JPEG
                </Button>
              </div>
            </div>

            <label className="text-xs block">
              <div className="flex items-center justify-between">
                <span>{isZh ? "预览缩放" : "Preview Scale"}</span>
                <span>{previewScale}%</span>
              </div>
              <input
                type="range"
                min={55}
                max={160}
                step={1}
                value={previewScale}
                onChange={(e) => setPreviewScale(Number(e.target.value))}
                className="w-full"
              />
            </label>
          </div>

          <div className="min-h-0 min-w-0 flex flex-col">
            <div className="relative flex-1 min-h-0 overflow-hidden rounded-lg border border-border/60 bg-muted/10 p-3 sm:p-4 flex items-center justify-center">
              {pages[safePageIndex]?.type === "content" ? (
                <div
                  style={{
                    transform: `scale(${Math.min(previewScale, 160) / 100})`,
                    transformOrigin: "center",
                  }}
                >
                  <Md2CardPreview
                    page={pages[safePageIndex]}
                    index={safePageIndex}
                    total={pages.length}
                    config={config}
                    cardStyleId={cardStyleId}
                    cardStyleModeId={cardStyleModeId}
                  />
                </div>
              ) : coverPreviewDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={coverPreviewDataUrl}
                  alt="text-card-preview"
                  className="h-auto w-auto rounded-md border border-border/40 shadow-sm object-contain"
                  style={{ maxWidth: `${Math.min(previewScale, 85)}%`, maxHeight: `${Math.min(previewScale, 88)}%` }}
                />
              ) : (
                <div className="text-sm text-muted-foreground py-12">{t("docPreview.textCardEmpty")}</div>
              )}

              <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
                <div className="flex items-center gap-2 rounded-full border border-[#e3e3e3] bg-[#f4f4f4]/95 px-3 py-1.5 shadow-[0_1px_4px_rgba(0,0,0,0.08)]">
                  <button
                    type="button"
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-[#dbdbdb] bg-[#efefef] text-[22px] font-medium leading-none text-[#7f7f7f] transition hover:bg-[#e9e9e9] disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                    disabled={safePageIndex <= 0}
                    aria-label={t("docPreview.textCardPrev")}
                  >
                    ←
                  </button>
                  <div className="flex h-9 min-w-[112px] items-center justify-center rounded-full border border-[#dbdbdb] bg-[#efefef] px-4 text-[24px] font-semibold leading-none tracking-tight text-[#171717]">
                    {pages.length > 0
                      ? t("docPreview.textCardPageIndicator", { current: safePageIndex + 1, total: pages.length })
                      : "-"}
                  </div>
                  <button
                    type="button"
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-[#dbdbdb] bg-[#efefef] text-[22px] font-medium leading-none text-[#7f7f7f] transition hover:bg-[#e9e9e9] disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => setPageIndex((p) => Math.min(Math.max(0, pages.length - 1), p + 1))}
                    disabled={pages.length === 0 || safePageIndex >= pages.length - 1}
                    aria-label={t("docPreview.textCardNext")}
                  >
                    →
                  </button>
                </div>
              </div>
            </div>

            {config.hasCover && coverStyleThumbs.length > 0 ? (
              <div className="mt-2 rounded-lg border border-border/60 bg-background/90 p-2">
                <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                  {coverStyleThumbs.map((thumb) => (
                    <button
                      key={thumb.id}
                      type="button"
                      className={`shrink-0 w-[74px] rounded-md border p-1 text-left ${config.coverStyleId === thumb.id ? "border-primary ring-2 ring-primary/30" : "border-border/60 hover:border-border"}`}
                      onClick={() => handleCoverStyleChange(thumb.id)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={thumb.dataUrl} alt={thumb.label} className="h-16 w-full rounded object-cover border border-border/50" />
                      <p className="mt-0.5 text-[9px] truncate">{thumb.label}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          {rightPanel ? (
            <aside className="min-h-0 overflow-y-auto rounded-lg border border-border/60 bg-background p-4">
              {rightPanel}
            </aside>
          ) : null}
        </div>

          {publishError ? <p className="text-xs text-destructive">{publishError}</p> : null}

          <DialogFooter>
            {xhsPublishMeta ? (
              <Button
                onClick={handlePublishToXhs}
                disabled={!canExport || isPublishing}
                className="bg-[#ec4a5d] text-white hover:bg-[#e13b4f] dark:bg-[#ec4a5d] dark:text-white dark:hover:bg-[#e13b4f]"
              >
                {isPublishing ? <SpinnerGap size={14} className="mr-2 animate-spin" /> : null}
                发布
              </Button>
            ) : null}
            <Button variant="outline" onClick={handleExportCurrent} disabled={!canExport}>
              {exporting ? (
                <SpinnerGap size={14} className="mr-2 animate-spin" />
              ) : (
                <DownloadSimple size={14} className="mr-2" />
              )}
              {t("docPreview.textCardExportCurrent")}
            </Button>
            <Button onClick={handleExportAll} disabled={!canExport}>
              {exporting ? (
                <SpinnerGap size={14} className="mr-2 animate-spin" />
              ) : (
                <DownloadSimple size={14} className="mr-2" />
              )}
              {t("docPreview.textCardExportAll")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
        <DialogContent className="!w-[min(560px,92vw)] !max-w-[min(560px,92vw)] rounded-[28px] p-5 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-center text-lg">发布二维码</DialogTitle>
            <DialogDescription className="text-center">扫码一键发布</DialogDescription>
          </DialogHeader>

          <div className="mt-3 flex flex-col items-center gap-3">
            {publishResult?.qrcode ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={publishResult.qrcode}
                alt="xhs-publish-qrcode"
                className="h-[280px] w-[280px] rounded-2xl border border-[#ececec] bg-white p-3"
              />
            ) : (
              <div className="rounded-lg border border-border/70 px-4 py-8 text-sm text-muted-foreground">暂无二维码</div>
            )}
          </div>

          <DialogFooter className="mt-5 justify-center">
            <Button variant="outline" onClick={() => setPublishDialogOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type MarkdownXhsLayoutModalProps = {
  isOpen: boolean;
  onClose: () => void;
  markdown: string;
  filePath?: string | null;
  xhsMeta?: {
    coverTitle?: string;
    subTitle?: string;
    title?: string;
    body?: string;
    tags?: string[];
  };
};

export function MarkdownXhsLayoutModal({
  isOpen,
  onClose,
  markdown,
  filePath,
  xhsMeta,
}: MarkdownXhsLayoutModalProps) {
  const [generatedMeta, setGeneratedMeta] = useState<{
    coverTitle: string;
    subTitle: string;
    title: string;
    body: string;
    tags: string[];
  } | null>(null);
  const [isGeneratingMeta, setIsGeneratingMeta] = useState(false);
  const [generateMetaError, setGenerateMetaError] = useState("");
  const [editableTitle, setEditableTitle] = useState("");
  const [editableBody, setEditableBody] = useState("");
  const [editableTagsText, setEditableTagsText] = useState("");

  const defaultTitle = getDefaultTitle(filePath || "untitled.md");
  const currentTags = useMemo(() => dedupeTags(parseTagsInput(editableTagsText)).slice(0, 8), [editableTagsText]);
  const titleLength = useMemo(() => Array.from(editableTitle).length, [editableTitle]);

  useEffect(() => {
    if (!isOpen) {
      setGeneratedMeta(null);
      setIsGeneratingMeta(false);
      setGenerateMetaError("");
      setEditableTitle("");
      setEditableBody("");
      setEditableTagsText("");
      return;
    }
    const draft = readXhsEditorDraft(filePath || "untitled.md");
    if (draft) {
      setEditableTitle(truncateXhsTitle(draft.title || defaultTitle));
      setEditableBody(sanitizeXhsPublishBody(draft.body || ""));
      setEditableTagsText(draft.tagsText || "");
      return;
    }
    const initTitle = (xhsMeta?.title || "").trim() || defaultTitle;
    const initBody = sanitizeXhsPublishBody((xhsMeta?.body || "").trim());
    const initTags = dedupeTags(Array.isArray(xhsMeta?.tags) ? xhsMeta.tags : []);
    setEditableTitle(truncateXhsTitle(initTitle));
    setEditableBody(initBody);
    setEditableTagsText(formatTagsInput(initTags));
  }, [isOpen, filePath, defaultTitle, xhsMeta?.title, xhsMeta?.body, xhsMeta?.tags]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => {
      writeXhsEditorDraft(filePath || "untitled.md", {
        title: editableTitle,
        body: editableBody,
        tagsText: editableTagsText,
      });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [isOpen, filePath, editableTitle, editableBody, editableTagsText]);

  const handleAutoGenerateMeta = async () => {
    if (isGeneratingMeta) return;
    setGenerateMetaError("");
    setIsGeneratingMeta(true);

    try {
      const response = await fetch("/api/xhs-layout/meta", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          markdown,
          filePath: filePath || "untitled.md",
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const message = typeof payload?.error === "string" && payload.error.trim()
          ? payload.error.trim()
          : `AI 生成失败（${response.status}）`;
        setGenerateMetaError(message);
        return;
      }

      const data = payload?.data;
      const nextTags = dedupeTags(Array.isArray(data?.tags) ? data.tags : []);
      const nextMeta = {
        coverTitle: "",
        subTitle: "",
        title: typeof data?.title === "string" ? data.title.trim() : "",
        body: typeof data?.body === "string" ? sanitizeXhsPublishBody(data.body) : "",
        tags: nextTags,
      };

      if (!nextMeta.title && !nextMeta.body && nextMeta.tags.length === 0) {
        setGenerateMetaError("AI 未生成有效内容，请重试或补充更清晰的正文。");
        return;
      }

      setGeneratedMeta(nextMeta);
      setEditableTitle(truncateXhsTitle(nextMeta.title || defaultTitle));
      setEditableBody(sanitizeXhsPublishBody(nextMeta.body));
      setEditableTagsText(formatTagsInput(nextTags));
      setGenerateMetaError("");
    } catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : "AI 生成失败，请稍后重试";
      setGenerateMetaError(message);
    } finally {
      setIsGeneratingMeta(false);
    }
  };

  return (
    <MarkdownTextCardDialog
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
      markdown={markdown}
      filePath={filePath || "untitled.md"}
      xhsPublishMeta={{
        title: truncateXhsTitle(editableTitle) || defaultTitle,
        body: sanitizeXhsPublishBody(editableBody),
        tags: currentTags,
      }}
      rightPanel={(
        <>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={handleAutoGenerateMeta}
                disabled={isGeneratingMeta}
                className="inline-flex items-center gap-1 rounded-md border border-border/70 px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isGeneratingMeta ? <SpinnerGap size={12} className="animate-spin" /> : <WandSparkles size={12} />}
                {isGeneratingMeta ? "生成中..." : "AI生成标题正文"}
              </button>
            </div>

            {generateMetaError ? <p className="text-xs text-destructive">{generateMetaError}</p> : null}

            <section className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">标题</p>
              <textarea
                value={editableTitle}
                rows={2}
                maxLength={40}
                onChange={(event) => setEditableTitle(truncateXhsTitle(event.target.value))}
                placeholder="请输入标题（最多20字）"
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-2xl font-bold leading-tight text-foreground outline-none focus:border-primary"
              />
              <p className="text-[11px] text-muted-foreground">{titleLength}/20</p>
            </section>

            <section className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">正文</p>
              <textarea
                value={editableBody}
                rows={8}
                onChange={(event) => setEditableBody(event.target.value.slice(0, 1000))}
                placeholder="请输入正文（最多1000字）"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm leading-6 text-foreground outline-none focus:border-primary"
              />
              <p className="text-[11px] text-muted-foreground">{editableBody.length}/1000</p>
            </section>

            <section className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">标签</p>
              <textarea
                value={editableTagsText}
                rows={2}
                onChange={(event) => setEditableTagsText(event.target.value)}
                placeholder="#标签1 #标签2（支持空格、换行、逗号分隔）"
                className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              />
              {currentTags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {currentTags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center rounded-full border border-border/70 px-2 py-0.5 text-xs text-foreground"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </section>
          </div>
        </>
      )}
    />
  );
}
