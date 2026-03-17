"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Sparkles, Film, Type } from "lucide-react";
import { cn } from "@/lib/utils";

export type KnowledgeVideoMode = "subtitle_wrap" | "knowledge_animation";

interface KnowledgeVideoFormProps {
  onSubmit: (payload: {
    mode: KnowledgeVideoMode;
    scriptContent: string;
    themeKey: string;
    timelineJson?: string;
  }) => Promise<void>;
}

const THEMES = [
  {
    key: "techGlow",
    label: "科技未来",
    description: "霓虹线条、数字网格、渐变字幕",
  },
  {
    key: "chalkBoard",
    label: "白板课堂",
    description: "手写体、擦除转场、课堂背景",
  },
  {
    key: "paperFold",
    label: "纸张折叠",
    description: "翻页动效、重点高亮条",
  },
];

export function KnowledgeVideoForm({ onSubmit }: KnowledgeVideoFormProps) {
  const [mode, setMode] = useState<KnowledgeVideoMode>("subtitle_wrap");
  const [scriptContent, setScriptContent] = useState("");
  const [timelineJson, setTimelineJson] = useState("");
  const [themeKey, setThemeKey] = useState(THEMES[0]?.key ?? "");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = scriptContent.trim().length > 0 && (!isKnowledgeMode(mode) || timelineJson.trim().length > 0);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({ mode, scriptContent, themeKey, timelineJson: timelineJson.trim() || undefined });
      setScriptContent("");
      setTimelineJson("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-gray-900 dark:text-white">选择视频模式</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(
            [
              {
                key: "subtitle_wrap" as KnowledgeVideoMode,
                title: "字幕包装",
                description: "自动重点高亮、节奏转场、封面生成",
                Icon: Type,
              },
              {
                key: "knowledge_animation" as KnowledgeVideoMode,
                title: "知识动画",
                description: "PPT 画面、图标飞入、段落配色",
                Icon: Film,
              },
            ] satisfies Array<{ key: KnowledgeVideoMode; title: string; description: string; Icon: typeof Film }>
          ).map((item) => {
            const active = mode === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setMode(item.key)}
                className={cn(
                  "relative rounded-2xl border px-4 py-4 text-left transition",
                  active
                    ? "border-primary bg-primary text-primary-foreground shadow-theme-glow"
                    : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-primary/50"
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-black/5 text-black dark:bg-white/10 dark:text-white">
                    <item.Icon className="w-5 h-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{item.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{item.description}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-semibold text-gray-900 dark:text-white">口播脚本</label>
        <textarea
          value={scriptContent}
          onChange={(event) => setScriptContent(event.target.value)}
          rows={5}
          placeholder="粘贴口播文案，系统会自动切句和高亮关键词"
          className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/70"
        />
      </div>

      <AnimatePresence>
        {mode === "knowledge_animation" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-2"
          >
            <label className="text-sm font-semibold text-gray-900 dark:text-white">画面节奏 JSON</label>
            <textarea
              value={timelineJson}
              onChange={(event) => setTimelineJson(event.target.value)}
              rows={4}
              placeholder='例如: [{"order":1,"title":"概念","visual":"流程箭头","duration":4}]'
              className="w-full rounded-xl border border-dashed border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/70"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div>
        <p className="text-sm font-semibold text-gray-900 dark:text-white">主题模板</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {THEMES.map((theme) => {
            const active = theme.key === themeKey;
            return (
              <button
                key={theme.key}
                type="button"
                onClick={() => setThemeKey(theme.key)}
                className={cn(
                  "rounded-2xl border px-4 py-4 text-left transition",
                  active
                    ? "border-primary bg-gradient-to-br from-primary to-primary-active text-primary-foreground shadow-theme-glow"
                    : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-primary/50"
                )}
              >
                <p className="text-sm font-semibold">{theme.label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{theme.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="submit"
        disabled={!canSubmit || submitting}
        className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-black px-6 py-3 text-sm font-semibold text-white shadow-lg transition disabled:opacity-60 dark:bg-white dark:text-black"
      >
        {submitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            任务创建中...
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            创建知识讲解任务
          </>
        )}
      </button>
    </form>
  );
}

function isKnowledgeMode(value: KnowledgeVideoMode) {
  return value === "knowledge_animation";
}
