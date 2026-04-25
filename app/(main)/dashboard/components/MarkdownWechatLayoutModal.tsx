"use client";

import { useEffect, useMemo, useState } from "react";
import MarkdownIt from "markdown-it";
import { ArrowsCounterClockwise, Copy, DownloadSimple } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTranslation } from "@/hooks/useTranslation";
import { splitMarkdownDocument } from "@/lib/markdown-frontmatter";
import { parseContentFactoryPackage } from "@/lib/contentFactoryFormat";

interface MarkdownWechatPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  markdown: string;
  filePath: string;
}

type WechatThemeStyle = {
  canvasBg: string;
  articleBg: string;
  articleBorder: string;
  textColor: string;
  titleColor: string;
  dividerColor: string;
  linkColor: string;
  blockquoteBorder: string;
  blockquoteBg: string;
  codeBg: string;
  preBg: string;
  hrColor: string;
  markBg: string;
};

type WechatThemePreset = {
  id: string;
  nameZh: string;
  nameEn: string;
  style: WechatThemeStyle;
};

type WechatCustomTheme = {
  id: string;
  name: string;
  style: WechatThemeStyle;
};

const WECHAT_THEME_STORAGE_KEY = "wechat-preview-custom-themes-v1";
const THEME_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const WECHAT_THEME_PRESETS: WechatThemePreset[] = [
  {
    id: "wechat-classic",
    nameZh: "公众号经典",
    nameEn: "WeChat Classic",
    style: {
      canvasBg: "#ececec",
      articleBg: "#ffffff",
      articleBorder: "#d8d8d8",
      textColor: "#222222",
      titleColor: "#111111",
      dividerColor: "#efefef",
      linkColor: "#576b95",
      blockquoteBorder: "#07c160",
      blockquoteBg: "#f6fffa",
      codeBg: "#f5f5f5",
      preBg: "#f7f7f9",
      hrColor: "#e6e6e6",
      markBg: "#fff5a8",
    },
  },
  {
    id: "clean-magazine",
    nameZh: "清爽杂志",
    nameEn: "Clean Magazine",
    style: {
      canvasBg: "#f3f4f6",
      articleBg: "#ffffff",
      articleBorder: "#e5e7eb",
      textColor: "#1f2937",
      titleColor: "#0f172a",
      dividerColor: "#e5e7eb",
      linkColor: "#2563eb",
      blockquoteBorder: "#60a5fa",
      blockquoteBg: "#eff6ff",
      codeBg: "#f3f4f6",
      preBg: "#f8fafc",
      hrColor: "#e5e7eb",
      markBg: "#fde68a",
    },
  },
  {
    id: "warm-paper",
    nameZh: "暖调纸感",
    nameEn: "Warm Paper",
    style: {
      canvasBg: "#efe7db",
      articleBg: "#fffaf2",
      articleBorder: "#e8dcc8",
      textColor: "#2b2b2b",
      titleColor: "#1f1f1f",
      dividerColor: "#eadfce",
      linkColor: "#92400e",
      blockquoteBorder: "#d97706",
      blockquoteBg: "#fff7ed",
      codeBg: "#f7efe2",
      preBg: "#f8f1e6",
      hrColor: "#e5d6bf",
      markBg: "#fde68a",
    },
  },
];

const THEME_FIELD_META: Array<{ key: keyof WechatThemeStyle; zh: string; en: string }> = [
  { key: "canvasBg", zh: "画布背景", en: "Canvas" },
  { key: "articleBg", zh: "文章背景", en: "Article Bg" },
  { key: "articleBorder", zh: "文章边框", en: "Article Border" },
  { key: "textColor", zh: "正文颜色", en: "Text" },
  { key: "titleColor", zh: "标题颜色", en: "Title" },
  { key: "dividerColor", zh: "标题分割线", en: "Title Divider" },
  { key: "linkColor", zh: "链接颜色", en: "Link" },
  { key: "blockquoteBorder", zh: "引用线色", en: "Quote Border" },
  { key: "blockquoteBg", zh: "引用背景", en: "Quote Bg" },
  { key: "codeBg", zh: "行内代码背景", en: "Inline Code Bg" },
  { key: "preBg", zh: "代码块背景", en: "Code Block Bg" },
  { key: "hrColor", zh: "分隔线颜色", en: "Hr" },
  { key: "markBg", zh: "高亮背景", en: "Highlight" },
];

const DEFAULT_WECHAT_THEME_STYLE: WechatThemeStyle = { ...WECHAT_THEME_PRESETS[0].style };

let _wechatMd: MarkdownIt | null = null;

function normalizeThemeColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!THEME_COLOR_RE.test(trimmed)) return fallback;
  return trimmed;
}

function coerceThemeStyle(value: unknown): WechatThemeStyle {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    canvasBg: normalizeThemeColor(source.canvasBg, DEFAULT_WECHAT_THEME_STYLE.canvasBg),
    articleBg: normalizeThemeColor(source.articleBg, DEFAULT_WECHAT_THEME_STYLE.articleBg),
    articleBorder: normalizeThemeColor(source.articleBorder, DEFAULT_WECHAT_THEME_STYLE.articleBorder),
    textColor: normalizeThemeColor(source.textColor, DEFAULT_WECHAT_THEME_STYLE.textColor),
    titleColor: normalizeThemeColor(source.titleColor, DEFAULT_WECHAT_THEME_STYLE.titleColor),
    dividerColor: normalizeThemeColor(source.dividerColor, DEFAULT_WECHAT_THEME_STYLE.dividerColor),
    linkColor: normalizeThemeColor(source.linkColor, DEFAULT_WECHAT_THEME_STYLE.linkColor),
    blockquoteBorder: normalizeThemeColor(source.blockquoteBorder, DEFAULT_WECHAT_THEME_STYLE.blockquoteBorder),
    blockquoteBg: normalizeThemeColor(source.blockquoteBg, DEFAULT_WECHAT_THEME_STYLE.blockquoteBg),
    codeBg: normalizeThemeColor(source.codeBg, DEFAULT_WECHAT_THEME_STYLE.codeBg),
    preBg: normalizeThemeColor(source.preBg, DEFAULT_WECHAT_THEME_STYLE.preBg),
    hrColor: normalizeThemeColor(source.hrColor, DEFAULT_WECHAT_THEME_STYLE.hrColor),
    markBg: normalizeThemeColor(source.markBg, DEFAULT_WECHAT_THEME_STYLE.markBg),
  };
}

function parseStoredCustomThemes(raw: string | null): WechatCustomTheme[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const result: WechatCustomTheme[] = [];
    for (let i = 0; i < parsed.length; i += 1) {
      const item = parsed[i];
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      const id = typeof record.id === "string" && record.id.trim() ? record.id.trim() : `custom-theme-${i + 1}`;
      const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : `Custom ${i + 1}`;
      result.push({
        id,
        name,
        style: coerceThemeStyle(record.style),
      });
    }
    return result;
  } catch {
    return [];
  }
}

function getPresetTheme(themeId: string): WechatThemePreset | undefined {
  return WECHAT_THEME_PRESETS.find((theme) => theme.id === themeId);
}

function markPlugin(md: MarkdownIt) {
  md.inline.ruler.before("emphasis", "mark", (state: any, silent: boolean) => {
    const start = state.pos;
    if (state.src.charCodeAt(start) !== 0x3d || state.src.charCodeAt(start + 1) !== 0x3d) return false;

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
        state.push("mark_open", "mark", 1);
        state.md.inline.tokenize(state);
        state.push("mark_close", "mark", -1);
        state.pos = prevPos;
        state.posMax = prevMax;
      }
      state.pos = match + 2;
      return true;
    }
    return false;
  });
}

function getWechatMd(): MarkdownIt {
  if (_wechatMd) return _wechatMd;
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    breaks: true,
    typographer: false,
  });
  markPlugin(md);
  _wechatMd = md;
  return md;
}

function getDefaultTitle(filePath: string): string {
  const file = filePath.split("/").pop() || filePath;
  return file.replace(/\.[^.]+$/, "") || "Document";
}

function sanitizeFileName(input: string): string {
  return input
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80) || "wechat-preview";
}

function buildExportHtml(
  title: string,
  contentHtml: string,
  fontScale: number,
  showTitle: boolean,
  themeStyle: WechatThemeStyle,
): string {
  const scaledFont = (17 * fontScale / 100).toFixed(2);
  const titleHtml = showTitle ? `<h1>${title}</h1>` : "";
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 24px; background: ${themeStyle.canvasBg}; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; color: ${themeStyle.textColor}; }
    .article { max-width: 760px; margin: 0 auto; border: 1px solid ${themeStyle.articleBorder}; border-radius: 10px; background: ${themeStyle.articleBg}; padding: 28px; line-height: 1.8; font-size: ${scaledFont}px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); color: ${themeStyle.textColor}; }
    .article h1 { margin: 0 0 16px; padding-bottom: 16px; border-bottom: 1px solid ${themeStyle.dividerColor}; font-size: 32px; line-height: 1.22; font-weight: 800; color: ${themeStyle.titleColor}; }
    .article h2 { margin: 32px 0 12px; font-size: 25px; line-height: 1.35; font-weight: 700; color: ${themeStyle.titleColor}; }
    .article h3 { margin: 24px 0 10px; font-size: 21px; line-height: 1.45; font-weight: 600; color: ${themeStyle.titleColor}; }
    .article p { margin: 20px 0; }
    .article ul, .article ol { margin: 20px 0; padding-left: 24px; }
    .article blockquote { margin: 22px 0; border-left: 4px solid ${themeStyle.blockquoteBorder}; background: ${themeStyle.blockquoteBg}; border-radius: 8px; padding: 12px 14px; }
    .article code { background: ${themeStyle.codeBg}; border-radius: 4px; padding: 1px 6px; font-size: 0.92em; }
    .article pre { margin: 20px 0; overflow: auto; background: ${themeStyle.preBg}; border-radius: 8px; padding: 14px; }
    .article pre code { background: transparent; padding: 0; }
    .article a { color: ${themeStyle.linkColor}; text-decoration: none; }
    .article img { max-width: 100%; height: auto; border-radius: 6px; margin: 20px auto; display: block; }
    .article hr { border: 0; border-top: 1px solid ${themeStyle.hrColor}; margin: 30px 0; }
    .article mark { background: ${themeStyle.markBg}; padding: 0 4px; border-radius: 3px; }
  </style>
</head>
<body>
  <article class="article">
    ${titleHtml}
    ${contentHtml}
  </article>
</body>
</html>`;
}

function downloadBlob(content: string, type: string, fileName: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function MarkdownWechatPreviewDialog({
  open,
  onOpenChange,
  markdown,
  filePath,
}: MarkdownWechatPreviewDialogProps) {
  const { t, locale } = useTranslation();
  const [draft, setDraft] = useState(markdown);
  const [fontScale, setFontScale] = useState(100);
  const [showTitle, setShowTitle] = useState(true);
  const [copied, setCopied] = useState(false);
  const [customThemes, setCustomThemes] = useState<WechatCustomTheme[]>([]);
  const [selectedThemeId, setSelectedThemeId] = useState<string>(WECHAT_THEME_PRESETS[0]?.id ?? "wechat-classic");
  const [themeStyle, setThemeStyle] = useState<WechatThemeStyle>({ ...DEFAULT_WECHAT_THEME_STYLE });
  const [customThemeName, setCustomThemeName] = useState("");
  const [themeEditorOpen, setThemeEditorOpen] = useState(false);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft(markdown);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setThemeEditorOpen(false);
    }
  }, [open, markdown]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = parseStoredCustomThemes(window.localStorage.getItem(WECHAT_THEME_STORAGE_KEY));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCustomThemes(stored);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(WECHAT_THEME_STORAGE_KEY, JSON.stringify(customThemes));
    } catch {
      // ignore localStorage failures
    }
  }, [customThemes]);

  const activeCustomTheme = useMemo(
    () => customThemes.find((theme) => theme.id === selectedThemeId) ?? null,
    [customThemes, selectedThemeId],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCustomThemeName(activeCustomTheme?.name ?? "");
  }, [activeCustomTheme?.id, activeCustomTheme?.name]);

  const applyThemeById = (themeId: string) => {
    const preset = getPresetTheme(themeId);
    if (preset) {
      setSelectedThemeId(preset.id);
      setThemeStyle({ ...preset.style });
      return;
    }
    const custom = customThemes.find((theme) => theme.id === themeId);
    if (custom) {
      setSelectedThemeId(custom.id);
      setThemeStyle({ ...custom.style });
    }
  };

  const resetThemeColors = () => {
    if (activeCustomTheme) {
      setThemeStyle({ ...activeCustomTheme.style });
      return;
    }
    const preset = getPresetTheme(selectedThemeId) ?? WECHAT_THEME_PRESETS[0];
    setThemeStyle({ ...preset.style });
  };

  const saveCustomTheme = () => {
    const defaultName = locale === "zh" ? `自定义主题 ${customThemes.length + 1}` : `Custom Theme ${customThemes.length + 1}`;
    const name = customThemeName.trim() || defaultName;
    const id = `custom-theme-${Date.now().toString(36)}`;
    const nextTheme: WechatCustomTheme = {
      id,
      name,
      style: { ...themeStyle },
    };
    setCustomThemes((prev) => [nextTheme, ...prev]);
    setSelectedThemeId(id);
    setCustomThemeName(name);
  };

  const updateCustomTheme = () => {
    if (!activeCustomTheme) return;
    const nextName = customThemeName.trim() || activeCustomTheme.name;
    const updatedTheme: WechatCustomTheme = {
      id: activeCustomTheme.id,
      name: nextName,
      style: { ...themeStyle },
    };
    setCustomThemes((prev) =>
      prev.map((theme) => (theme.id === updatedTheme.id ? updatedTheme : theme)),
    );
    setCustomThemeName(nextName);
  };

  const deleteCustomTheme = () => {
    if (!activeCustomTheme) return;
    setCustomThemes((prev) => prev.filter((theme) => theme.id !== activeCustomTheme.id));
    const fallbackTheme = WECHAT_THEME_PRESETS[0];
    setSelectedThemeId(fallbackTheme.id);
    setThemeStyle({ ...fallbackTheme.style });
    setCustomThemeName("");
  };

  const previewScopedStyle = useMemo(() => {
    return `
      .wechat-preview-scope .wechat-preview-body h1,
      .wechat-preview-scope .wechat-preview-body h2,
      .wechat-preview-scope .wechat-preview-body h3 {
        color: ${themeStyle.titleColor};
      }
      .wechat-preview-scope .wechat-preview-body blockquote {
        border-left-color: ${themeStyle.blockquoteBorder};
        background: ${themeStyle.blockquoteBg};
      }
      .wechat-preview-scope .wechat-preview-body code {
        background: ${themeStyle.codeBg};
      }
      .wechat-preview-scope .wechat-preview-body pre {
        background: ${themeStyle.preBg};
      }
      .wechat-preview-scope .wechat-preview-body a {
        color: ${themeStyle.linkColor};
      }
      .wechat-preview-scope .wechat-preview-body hr {
        border-top-color: ${themeStyle.hrColor};
      }
      .wechat-preview-scope .wechat-preview-body mark {
        background: ${themeStyle.markBg};
      }
    `;
  }, [themeStyle]);

  const parsed = useMemo(() => splitMarkdownDocument(draft), [draft]);
  const contentFactoryDraft = useMemo(() => parseContentFactoryPackage(draft), [draft]);
  const title = useMemo(() => {
    if (contentFactoryDraft.title.trim()) return contentFactoryDraft.title.trim();
    const titleEntry = parsed.frontmatter.find((entry) => entry.key.toLowerCase() === "title");
    if (typeof titleEntry?.value === "string" && titleEntry.value.trim()) return titleEntry.value.trim();
    return getDefaultTitle(filePath);
  }, [contentFactoryDraft.title, filePath, parsed.frontmatter]);

  const body = (contentFactoryDraft.body || parsed.body).trimStart();
  const contentHtml = useMemo(() => getWechatMd().render(body), [body]);
  const exportHtml = useMemo(
    () => buildExportHtml(title, contentHtml, fontScale, showTitle, themeStyle),
    [title, contentHtml, fontScale, showTitle, themeStyle],
  );
  const baseName = useMemo(() => sanitizeFileName(title), [title]);

  const copyHtml = async () => {
    try {
      await navigator.clipboard.writeText(exportHtml);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!w-[min(1800px,99vw)] !max-w-[min(1800px,99vw)] sm:!max-w-[min(1800px,99vw)] h-[96vh] max-h-[96vh] overflow-hidden flex flex-col gap-3 px-3 sm:px-4">
        <DialogHeader>
          <DialogTitle>{t("docPreview.wechatPreviewTitle")}</DialogTitle>
          <DialogDescription>{t("docPreview.wechatPreviewDesc")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 xl:gap-4 md:grid-cols-[minmax(360px,1fr)_minmax(0,1.2fr)] flex-1 min-h-0">
          <div className="min-h-0 rounded-lg border border-border/60 bg-muted/20 p-3 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-2 text-xs rounded border border-border bg-background px-2 py-2">
                <input
                  type="checkbox"
                  checked={showTitle}
                  onChange={(e) => setShowTitle(e.target.checked)}
                />
                <span>{t("docPreview.wechatShowTitle")}</span>
              </label>
              <Button
                variant="outline"
                size="sm"
                className="justify-center"
                onClick={() => setDraft(markdown)}
              >
                <ArrowsCounterClockwise size={14} className="mr-1.5" />
                {t("docPreview.wechatResetDraft")}
              </Button>
            </div>

            <label className="text-xs block">
              <div className="flex items-center justify-between">
                <span>{t("docPreview.wechatPreviewScale")}</span>
                <span>{fontScale}%</span>
              </div>
              <input
                type="range"
                min={80}
                max={130}
                step={1}
                value={fontScale}
                onChange={(e) => setFontScale(Number(e.target.value))}
                className="w-full"
              />
            </label>

            <div className="rounded-md border border-border bg-background/90 p-2 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium">{t("docPreview.wechatThemeTitle")}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {(getPresetTheme(selectedThemeId)
                      ? locale === "zh"
                        ? getPresetTheme(selectedThemeId)?.nameZh
                        : getPresetTheme(selectedThemeId)?.nameEn
                      : activeCustomTheme?.name) ?? (locale === "zh" ? "未命名主题" : "Unnamed Theme")}
                  </p>
                </div>
                <Button
                  variant={themeEditorOpen ? "outline" : "default"}
                  size="sm"
                  className="h-7 px-2 text-xs shrink-0"
                  onClick={() => setThemeEditorOpen((prev) => !prev)}
                >
                  {themeEditorOpen ? t("docPreview.wechatThemeCollapse") : t("docPreview.wechatThemeEdit")}
                </Button>
              </div>

              {themeEditorOpen ? (
                <>
                  <div className="space-y-1">
                    <p className="text-[11px] text-muted-foreground">{t("docPreview.wechatThemePresets")}</p>
                    <div className="flex flex-wrap gap-1">
                      {WECHAT_THEME_PRESETS.map((preset) => (
                        <Button
                          key={preset.id}
                          variant={selectedThemeId === preset.id ? "default" : "outline"}
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => applyThemeById(preset.id)}
                        >
                          {locale === "zh" ? preset.nameZh : preset.nameEn}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[11px] text-muted-foreground">{t("docPreview.wechatThemeCustomList")}</p>
                    {customThemes.length ? (
                      <div className="flex flex-wrap gap-1">
                        {customThemes.map((theme) => (
                          <Button
                            key={theme.id}
                            variant={selectedThemeId === theme.id ? "default" : "outline"}
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => applyThemeById(theme.id)}
                          >
                            {theme.name}
                          </Button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">{t("docPreview.wechatThemeCustomEmpty")}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-1 max-h-44 overflow-auto pr-1">
                    {THEME_FIELD_META.map((field) => (
                      <label
                        key={field.key}
                        className="flex items-center justify-between gap-2 rounded border border-border/80 px-2 py-1.5 text-[11px]"
                      >
                        <span>{locale === "zh" ? field.zh : field.en}</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="color"
                            value={themeStyle[field.key]}
                            onChange={(e) =>
                              setThemeStyle((prev) => ({
                                ...prev,
                                [field.key]: normalizeThemeColor(e.target.value, prev[field.key]),
                              }))
                            }
                            className="h-6 w-7 cursor-pointer rounded border border-border bg-transparent p-0"
                          />
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {themeStyle[field.key].toUpperCase()}
                          </span>
                        </div>
                      </label>
                    ))}
                  </div>

                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-1">
                    <input
                      value={customThemeName}
                      onChange={(e) => setCustomThemeName(e.target.value)}
                      className="h-8 rounded border border-border bg-background px-2 text-xs"
                      placeholder={t("docPreview.wechatThemeNamePlaceholder")}
                    />
                    <Button
                      size="sm"
                      className="h-8 px-2 text-xs"
                      onClick={activeCustomTheme ? updateCustomTheme : saveCustomTheme}
                    >
                      {activeCustomTheme ? t("docPreview.wechatThemeUpdate") : t("docPreview.wechatThemeSave")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2 text-xs"
                      onClick={resetThemeColors}
                    >
                      {t("docPreview.wechatThemeResetColors")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2 text-xs"
                      disabled={!activeCustomTheme}
                      onClick={deleteCustomTheme}
                    >
                      {t("docPreview.wechatThemeDelete")}
                    </Button>
                  </div>
                </>
              ) : null}
            </div>

            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="flex-1 min-h-0 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm font-mono leading-6"
              placeholder={t("skills.placeholder")}
            />
          </div>

          <div
            className="wechat-preview-scope min-h-0 overflow-auto rounded-lg border border-border/60 p-3"
            style={{ backgroundColor: themeStyle.canvasBg }}
          >
            <style>{previewScopedStyle}</style>
            <article
              className="mx-auto w-full max-w-[760px] rounded-[10px] border px-7 py-7 shadow-[0_4px_20px_rgba(0,0,0,0.06)]"
              style={{
                fontSize: `${(17 * fontScale / 100).toFixed(2)}px`,
                lineHeight: 1.8,
                backgroundColor: themeStyle.articleBg,
                borderColor: themeStyle.articleBorder,
                color: themeStyle.textColor,
              }}
            >
              {showTitle ? (
                <h1
                  className="m-0 mb-4 border-b pb-4 text-[32px] leading-[1.22] font-extrabold tracking-tight"
                  style={{ color: themeStyle.titleColor, borderBottomColor: themeStyle.dividerColor }}
                >
                  {title}
                </h1>
              ) : null}
              <div
                className={[
                  "wechat-preview-body",
                  "[&_p]:my-5 [&_h1]:mt-10 [&_h1]:mb-4 [&_h1]:text-[30px] [&_h1]:leading-[1.3] [&_h1]:font-extrabold",
                  "[&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-[25px] [&_h2]:leading-[1.35] [&_h2]:font-bold",
                  "[&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-[21px] [&_h3]:leading-[1.45] [&_h3]:font-semibold",
                  "[&_ul]:my-5 [&_ul]:pl-6 [&_ol]:my-5 [&_ol]:pl-6",
                  "[&_blockquote]:my-6 [&_blockquote]:rounded-[8px] [&_blockquote]:border-l-4 [&_blockquote]:px-4 [&_blockquote]:py-3",
                  "[&_code]:rounded [&_code]:px-1.5 [&_code]:py-[1px] [&_code]:text-[0.92em]",
                  "[&_pre]:my-5 [&_pre]:overflow-auto [&_pre]:rounded-[8px] [&_pre]:p-4 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
                  "[&_a]:no-underline hover:[&_a]:underline",
                  "[&_img]:my-6 [&_img]:mx-auto [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-[6px]",
                  "[&_hr]:my-8 [&_hr]:border-0 [&_hr]:border-t",
                  "[&_mark]:rounded [&_mark]:px-1",
                  "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
                ].join(" ")}
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: contentHtml }}
              />
            </article>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={copyHtml}>
            <Copy size={14} className="mr-2" />
            {copied ? t("docPreview.wechatCopiedHtml") : t("docPreview.wechatCopyHtml")}
          </Button>
          <Button variant="outline" onClick={() => downloadBlob(draft, "text/markdown;charset=utf-8", `${baseName}.md`)}>
            <DownloadSimple size={14} className="mr-2" />
            {t("docPreview.wechatExportMarkdown")}
          </Button>
          <Button onClick={() => downloadBlob(exportHtml, "text/html;charset=utf-8", `${baseName}.html`)}>
            <DownloadSimple size={14} className="mr-2" />
            {t("docPreview.wechatExportHtml")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type MarkdownWechatLayoutModalProps = {
  isOpen: boolean;
  onClose: () => void;
  markdown: string;
  filePath?: string | null;
};

export function MarkdownWechatLayoutModal({
  isOpen,
  onClose,
  markdown,
  filePath,
}: MarkdownWechatLayoutModalProps) {
  return (
    <MarkdownWechatPreviewDialog
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
      markdown={markdown}
      filePath={filePath || "untitled.md"}
    />
  );
}
