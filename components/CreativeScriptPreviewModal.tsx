"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "react-hot-toast";
import {
  X,
  Sparkles,
  BookOpen,
  AlertTriangle,
  Video,
  Image as ImageIcon,
  Loader2,
  CheckCircle2,
  User,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTenantPath } from "@/hooks/useTenant";
import { useLanguage } from "@/contexts/LanguageContext";

export interface CreativeScriptData {
  script_content: string;
  title: string;
  duration_estimate: string;
  viral_logic?: string;
  style_applied?: string;
  needs_more_history?: boolean;
  data_suggestion?: string;
  character_id?: string;
}

type CharacterOption = { id: string; name: string; avatar?: string | null };
type StyleOption = { id: string; name: string; thumbnailUrl?: string | null };

interface CreativeScriptPreviewModalProps {
  replicationId: string;
  scriptData: CreativeScriptData;
  authToken: string;
  onVideoConfirmed: (videoId: string) => void;
  onPosterConfirmed: () => void;
  onClose: () => void;
}

export function CreativeScriptPreviewModal({
  replicationId,
  scriptData,
  authToken,
  onVideoConfirmed,
  onPosterConfirmed,
  onClose,
}: CreativeScriptPreviewModalProps) {
  const { language } = useLanguage();
  const languageLabel =
    language === "zh-TW" ? "繁体" : language === "en" ? "English" : "简体";
  const [editedScript, setEditedScript] = useState(scriptData.script_content);
  const hasEdited = editedScript !== scriptData.script_content;
  const charCount = editedScript.length;

  // ── 数字人视频：展开 + 角色选择 ────────────────────────────────────────────
  const [showVideoOptions, setShowVideoOptions] = useState(false);
  const [characters, setCharacters] = useState<CharacterOption[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const [loadingCharacters, setLoadingCharacters] = useState(false);
  const [isConfirmingVideo, setIsConfirmingVideo] = useState(false);

  useEffect(() => {
    if (!showVideoOptions || characters.length > 0) return;
    setLoadingCharacters(true);
    fetch("/api/characters", { headers: { Authorization: `Bearer ${authToken}` } })
      .then(async (r) => {
        const payload = await r.json().catch(() => ({}));
        if (!r.ok) {
          throw new Error(payload?.error || "角色加载失败");
        }
        return payload;
      })
      .then((data) => {
        const list: CharacterOption[] = Array.isArray(data) ? data : (data?.data ?? []);
        setCharacters(list);
        if (list.length > 0) setSelectedCharacterId(list[0].id);
      })
      .catch(() => toast.error("角色加载失败"))
      .finally(() => setLoadingCharacters(false));
  }, [showVideoOptions, characters.length, authToken]);

  // ── 小红书图文：展开 + 样式选择 ────────────────────────────────────────────
  const [showPosterOptions, setShowPosterOptions] = useState(false);
  const [styles, setStyles] = useState<StyleOption[]>([]);
  const [selectedStyleId, setSelectedStyleId] = useState("");
  const [loadingStyles, setLoadingStyles] = useState(false);
  const [isConfirmingPoster, setIsConfirmingPoster] = useState(false);

  useEffect(() => {
    if (!showPosterOptions || styles.length > 0) return;
    setLoadingStyles(true);
    fetch("/api/assets/styles?limit=6", { headers: { Authorization: `Bearer ${authToken}` } })
      .then((r) => r.json())
      .then((data) => {
        const list: StyleOption[] = (data?.data ?? []).map((s: any) => ({
          id: s.id,
          name: s.name,
          thumbnailUrl: s.thumbnailUrl ?? s.thumbnail_url ?? null,
        }));
        setStyles(list);
        if (list.length > 0) setSelectedStyleId(list[0].id);
      })
      .catch(() => toast.error("样式加载失败"))
      .finally(() => setLoadingStyles(false));
  }, [showPosterOptions, styles.length, authToken]);

  const resourcesPath = useTenantPath("/resources");

  // ── 切换展开区域（互斥） ────────────────────────────────────────────────────
  const toggleVideo = () => {
    setShowVideoOptions((v) => !v);
    setShowPosterOptions(false);
  };
  const togglePoster = () => {
    setShowPosterOptions((v) => !v);
    setShowVideoOptions(false);
  };

  // ── 生成数字人视频 ────────────────────────────────────────────────────────
  async function handleVideoConfirm() {
    if (!editedScript.trim()) { toast.error("文案内容不能为空"); return; }
    if (!selectedCharacterId) { toast.error("请选择一个数字人角色"); return; }
    setIsConfirmingVideo(true);
    try {
      const res = await fetch("/api/replication/digital-human/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          replicationId,
          scriptContent: editedScript,
          characterId: selectedCharacterId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `请求失败 ${res.status}`);
      const jobCount = Number(data?.data?.jobCount ?? data?.jobCount ?? 1);
      if (jobCount > 1) {
        toast.success(`已拆分并提交 ${jobCount} 段数字人任务，系统将依次生成。`);
      } else {
        toast.success("视频生成已启动，请稍候");
      }
      onVideoConfirmed(data.data?.videoId ?? "");
    } catch (err: any) {
      toast.error(err.message || "视频生成失败，请重试");
    } finally {
      setIsConfirmingVideo(false);
    }
  }

  // ── 生成小红书图文 ────────────────────────────────────────────────────────
  async function handlePosterConfirm() {
    if (!editedScript.trim()) { toast.error("文案内容不能为空"); return; }
    if (!selectedStyleId) { toast.error("请先选择一个图文样式"); return; }
    setIsConfirmingPoster(true);
    try {
      const res = await fetch("/api/xhs-text2img/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          title: scriptData.title || "智能创作图文",
          text: editedScript,
          styleId: selectedStyleId,
          imageCount: 3,
          language: languageLabel,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `请求失败 ${res.status}`);
      toast.success("图文生成已启动，请稍候");
      onPosterConfirmed();
    } catch (err: any) {
      toast.error(err.message || "图文生成失败，请重试");
    } finally {
      setIsConfirmingPoster(false);
    }
  }

  const isAnyLoading = isConfirmingVideo || isConfirmingPoster;

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-purple-500" />
            <h2 className="font-semibold text-gray-900 dark:text-white text-base">AI 生成文案预览</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">

          {/* 历史数据不足提示 */}
          {scriptData.needs_more_history && (
            <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl">
              <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">历史文案数据不足</p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  {scriptData.data_suggestion || "上传更多历史文案后，AI 将能更好地模仿你的写作风格"}
                </p>
                <a href={resourcesPath} className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-amber-700 dark:text-amber-300 hover:underline">
                  前往「我的资源」上传历史文案
                </a>
              </div>
            </div>
          )}

          {/* 标题 & 时长 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <p className="text-xs text-gray-400 mb-1">推荐标题</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white">{scriptData.title || "—"}</p>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <p className="text-xs text-gray-400 mb-1">预计时长</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white">{scriptData.duration_estimate || "—"}</p>
            </div>
          </div>

          {/* AI 创作依据 */}
          {(scriptData.viral_logic || scriptData.style_applied) && (
            <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl space-y-1.5">
              <div className="flex items-center gap-1.5 mb-2">
                <BookOpen size={13} className="text-purple-500" />
                <span className="text-xs font-medium text-purple-700 dark:text-purple-300">创作依据</span>
              </div>
              {scriptData.viral_logic && (
                <p className="text-xs text-purple-700 dark:text-purple-300">
                  <span className="font-medium">爆款逻辑：</span>{scriptData.viral_logic}
                </p>
              )}
              {scriptData.style_applied && (
                <p className="text-xs text-purple-700 dark:text-purple-300">
                  <span className="font-medium">风格应用：</span>{scriptData.style_applied}
                </p>
              )}
            </div>
          )}

          {/* 文案编辑区 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                生成文案
                {hasEdited && <span className="ml-2 text-xs text-blue-500 font-normal">（已编辑）</span>}
              </label>
              <span className={cn("text-xs",
                charCount > 280 ? "text-red-500" : charCount < 150 ? "text-amber-500" : "text-gray-400"
              )}>
                {charCount} 字
                {charCount > 280 && " · 偏长"}
                {charCount < 150 && charCount > 0 && " · 偏短"}
              </span>
            </div>
            <textarea
              value={editedScript}
              onChange={(e) => setEditedScript(e.target.value)}
              rows={8}
              className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-purple-400 dark:focus:ring-purple-600 placeholder-gray-400"
              placeholder="AI 生成的文案将显示在这里，你可以直接编辑..."
            />
            <p className="text-xs text-gray-400 mt-1.5">建议 150–280 字（约 30–65 秒口播时长）</p>
          </div>

          {/* ── 数字人视频：展开区 ─────────────────────────────────────────── */}
          {showVideoOptions && (
            <div className="border border-purple-100 dark:border-purple-800 rounded-xl p-4 space-y-3 bg-purple-50/50 dark:bg-purple-900/10">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <User size={14} className="text-purple-500" />
                选择数字人角色
              </p>
              {loadingCharacters ? (
                <div className="flex items-center gap-2 py-3 text-sm text-gray-400">
                  <Loader2 size={14} className="animate-spin" /> 加载角色列表…
                </div>
              ) : characters.length === 0 ? (
                <p className="text-xs text-gray-400">
                  暂无角色，请前往{" "}
                  <a href={resourcesPath} className="text-purple-500 hover:underline">「我的资源」</a>{" "}
                  创建角色后再试
                </p>
              ) : (
                <div className="relative">
                  <select
                    value={selectedCharacterId}
                    onChange={(e) => setSelectedCharacterId(e.target.value)}
                    className="w-full px-4 py-2.5 pr-9 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400 appearance-none"
                  >
                    {characters.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              )}
              <button
                onClick={handleVideoConfirm}
                disabled={isAnyLoading || !selectedCharacterId || !editedScript.trim()}
                className={cn(
                  "w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all",
                  isAnyLoading || !selectedCharacterId || !editedScript.trim()
                    ? "bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed"
                    : "bg-purple-600 hover:bg-purple-700 text-white shadow-sm"
                )}
              >
                {isConfirmingVideo ? (
                  <><Loader2 size={14} className="animate-spin" /> 视频生成中...</>
                ) : (
                  <><CheckCircle2 size={14} /> 确认生成数字人视频</>
                )}
              </button>
            </div>
          )}

          {/* ── 小红书图文：展开区 ─────────────────────────────────────────── */}
          {showPosterOptions && (
            <div className="border border-gray-100 dark:border-gray-700 rounded-xl p-4 space-y-3 bg-gray-50 dark:bg-gray-800/50">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">选择图文样式</p>
              {loadingStyles ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 size={16} className="animate-spin text-gray-400" />
                </div>
              ) : styles.length === 0 ? (
                <p className="text-xs text-gray-400">
                  暂无样式，请前往{" "}
                  <a href={resourcesPath} className="text-purple-500 hover:underline">「我的资源」</a>{" "}
                  创建样式后再试
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {styles.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedStyleId(s.id)}
                      className={cn(
                        "relative rounded-lg overflow-hidden border-2 transition-all aspect-[3/4] flex items-end",
                        selectedStyleId === s.id ? "border-purple-500" : "border-transparent hover:border-gray-300"
                      )}
                    >
                      {s.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.thumbnailUrl} alt={s.name} className="absolute inset-0 w-full h-full object-cover" />
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900 dark:to-pink-900" />
                      )}
                      <span className="relative z-10 w-full text-center text-xs font-medium px-1 py-0.5 bg-black/40 text-white truncate">
                        {s.name}
                      </span>
                      {selectedStyleId === s.id && (
                        <CheckCircle2 size={16} className="absolute top-1.5 right-1.5 text-white drop-shadow z-10" />
                      )}
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={handlePosterConfirm}
                disabled={isAnyLoading || !selectedStyleId || !editedScript.trim()}
                className={cn(
                  "w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all",
                  isAnyLoading || !selectedStyleId || !editedScript.trim()
                    ? "bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed"
                    : "bg-black dark:bg-white text-white dark:text-black hover:opacity-90"
                )}
              >
                {isConfirmingPoster ? (
                  <><Loader2 size={14} className="animate-spin" /> 图文生成中...</>
                ) : (
                  <><CheckCircle2 size={15} /> 确认生成小红书图文</>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Footer：两个主操作按钮 */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            取消
          </button>
          <div className="flex items-center gap-2">
            {/* 生成小红书图文 */}
            <button
              type="button"
              onClick={togglePoster}
              disabled={isAnyLoading || !editedScript.trim()}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all",
                showPosterOptions
                  ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                  : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-400",
                (isAnyLoading || !editedScript.trim()) && "opacity-50 cursor-not-allowed"
              )}
            >
              <ImageIcon size={14} />
              生成小红书图文
            </button>
            {/* 生成数字人视频 */}
            <button
              type="button"
              onClick={toggleVideo}
              disabled={isAnyLoading || !editedScript.trim()}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all",
                showVideoOptions
                  ? "bg-purple-700 text-white"
                  : "bg-purple-600 hover:bg-purple-700 text-white shadow-sm hover:shadow-md",
                (isAnyLoading || !editedScript.trim()) && "opacity-50 cursor-not-allowed"
              )}
            >
              <Video size={14} />
              生成数字人视频
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
