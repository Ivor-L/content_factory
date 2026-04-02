"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { toast } from "react-hot-toast";
import {
  X,
  UserCircle2,
  PlusCircle,
  CheckCircle2,
  Bot,
  Sparkles,
  BookOpen,
  AlertTriangle,
  ExternalLink,
  ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTenantPath } from "@/hooks/useTenant";

export interface DHScriptData {
  script_content: string;
  title: string;
  duration_estimate: string;
  viral_logic?: string;
  style_applied?: string;
  needs_more_history?: boolean;
  data_suggestion?: string;
  character_id?: string;
}

interface DHSetupModalProps {
  scriptId: string;
  ideaText: string;
  audience?: string;
  title?: string;
  characters: { id: string; name: string; avatar: string }[];
  authToken: string;
  onConfirmed: () => void;
  onClose: () => void;
  onAddCharacter: () => void;
}

const WORD_COUNT_OPTIONS = [200, 400, 600, 800] as const;
const DEFAULT_WORD_COUNT = 600;

type Step = "word-count" | "preview" | "character";

export function DHSetupModal({
  scriptId,
  ideaText,
  audience,
  title,
  characters,
  authToken,
  onConfirmed,
  onClose,
  onAddCharacter,
}: DHSetupModalProps) {
  const [step, setStep] = useState<Step>("word-count");
  const [wordCount, setWordCount] = useState(DEFAULT_WORD_COUNT);
  const [isGenerating, setIsGenerating] = useState(false);
  const [pendingReplicationId, setPendingReplicationId] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [dhScriptData, setDhScriptData] = useState<DHScriptData | null>(null);
  const [editedScript, setEditedScript] = useState("");
  const [selectedCharacter, setSelectedCharacter] = useState(characters[0]?.id ?? "");
  const [isConfirming, setIsConfirming] = useState(false);

  const resourcesPath = useTenantPath("/resources");

  useEffect(() => {
    if (!selectedCharacter && characters.length > 0) {
      setSelectedCharacter(characters[0].id);
    }
  }, [characters, selectedCharacter]);

  // Poll replication status
  useEffect(() => {
    if (!pendingReplicationId || !isPolling || !authToken) return;

    let stopped = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/replication/${pendingReplicationId}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (!res.ok) return;
        const { data } = await res.json();
        if (stopped) return;

        if (data.status === "script_ready") {
          setIsPolling(false);
          setIsGenerating(false);
          const scriptResult = data.result as DHScriptData;
          setDhScriptData(scriptResult);
          setEditedScript(scriptResult.script_content ?? "");
          setStep("preview");
        } else if (data.status === "script_failed") {
          setIsPolling(false);
          setIsGenerating(false);
          toast.error(data.result?.error || "文案生成失败，请重试");
          setPendingReplicationId(null);
        }
      } catch {}
    };

    const interval = setInterval(poll, 3000);
    poll();
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [pendingReplicationId, isPolling, authToken]);

  async function handleGenerate() {
    const placeholderCharacterId = characters[0]?.id;
    if (!placeholderCharacterId) {
      toast.error("请先添加至少一个数字人形象后再生成");
      onAddCharacter();
      return;
    }
    setIsGenerating(true);
    try {
      const res = await fetch("/api/replication/digital-human", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          scriptId,
          characterId: placeholderCharacterId,
          wordCount,
          ideaText,
          audience,
          title: title || "",
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `请求失败 ${res.status}`);
      }
      const resData = await res.json().catch(() => ({}));
      const replicationId = resData.data?.replicationId;
      if (!replicationId) throw new Error("未获取到 replicationId");
      setPendingReplicationId(replicationId);
      setIsPolling(true);
      toast.success("文案生成中，请稍候…", { icon: "🤖", duration: 3000 });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "启动失败，请重试";
      toast.error(message);
      setIsGenerating(false);
    }
  }

  async function handleConfirmVideo() {
    if (!selectedCharacter) {
      toast.error("请选择数字人形象");
      return;
    }
    if (!editedScript.trim()) {
      toast.error("文案内容不能为空");
      return;
    }
    if (!pendingReplicationId) return;

    setIsConfirming(true);
    try {
      const res = await fetch("/api/replication/digital-human/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          replicationId: pendingReplicationId,
          scriptContent: editedScript,
          characterId: selectedCharacter,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `请求失败 ${res.status}`);
      }
      toast.success("视频生成已启动，请稍候");
      onConfirmed();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "确认失败，请重试";
      toast.error(message);
    } finally {
      setIsConfirming(false);
    }
  }

  const charCount = editedScript.length;
  const hasEdited = dhScriptData ? editedScript !== dhScriptData.script_content : false;

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isGenerating && !isConfirming) onClose();
      }}
    >
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            {step === "character" && (
              <button
                onClick={() => setStep("preview")}
                className="p-1 -ml-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors mr-1"
              >
                <ChevronLeft size={16} className="text-gray-500" />
              </button>
            )}
            {step === "word-count" && <Bot size={18} className="text-purple-500" />}
            {step === "preview" && <Sparkles size={18} className="text-purple-500" />}
            {step === "character" && <UserCircle2 size={18} className="text-purple-500" />}
            <h2 className="font-semibold text-gray-900 dark:text-white text-base">
              {step === "word-count" && "AI 二创文案"}
              {step === "preview" && "预览 & 编辑文案"}
              {step === "character" && "选择数字人形象"}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {/* Step indicator */}
            <div className="flex items-center gap-1">
              {(["word-count", "preview", "character"] as Step[]).map((s, i) => (
                <div
                  key={s}
                  className={cn(
                    "w-1.5 h-1.5 rounded-full transition-all",
                    step === s
                      ? "bg-purple-500 w-4"
                      : (["word-count", "preview", "character"] as Step[]).indexOf(step) > i
                      ? "bg-purple-300 dark:bg-purple-700"
                      : "bg-gray-200 dark:bg-gray-700"
                  )}
                />
              ))}
            </div>
            <button
              onClick={onClose}
              disabled={isGenerating || isConfirming}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-40"
            >
              <X size={16} className="text-gray-500" />
            </button>
          </div>
        </div>

        {/* ── Step 1: Word count selection ── */}
        {step === "word-count" && (
          <>
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                AI 将根据对标视频内容，生成专属口播文案。选择合适的字数后开始生成。
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  文案字数
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {WORD_COUNT_OPTIONS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setWordCount(n)}
                      className={cn(
                        "py-3 rounded-xl border-2 text-sm font-medium transition-all",
                        wordCount === n
                          ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300"
                          : "border-gray-100 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600"
                      )}
                    >
                      <div>{n}</div>
                      <div className="text-[10px] opacity-60">字</div>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  默认 600 字 · 建议时长约 1.5 分钟
                </p>
              </div>

              {isGenerating && (
                <div className="flex flex-col items-center gap-3 py-6">
                  <div className="w-10 h-10 border-3 border-purple-200 dark:border-purple-800 border-t-purple-500 rounded-full animate-spin" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    AI 正在分析对标视频并生成文案，通常需要 30-60 秒…
                  </p>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
              <button
                onClick={onClose}
                disabled={isGenerating}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors disabled:opacity-40"
              >
                取消
              </button>
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className={cn(
                  "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all",
                  isGenerating
                    ? "bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed"
                    : "bg-purple-600 hover:bg-purple-700 text-white shadow-sm hover:shadow-md"
                )}
              >
                {isGenerating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    生成中…
                  </>
                ) : (
                  <>
                    <Sparkles size={15} />
                    开始生成文案
                  </>
                )}
              </button>
            </div>
          </>
        )}

        {/* ── Step 2: Script preview & edit ── */}
        {step === "preview" && dhScriptData && (
          <>
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
              {/* 历史数据不足提示 */}
              {dhScriptData.needs_more_history && (
                <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl">
                  <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                      历史文案数据不足
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                      {dhScriptData.data_suggestion ||
                        "上传更多历史文案后，AI 将能更好地模仿你的写作风格"}
                    </p>
                    <a
                      href={resourcesPath}
                      className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-amber-700 dark:text-amber-300 hover:underline"
                    >
                      前往「我的资源」上传历史文案
                      <ExternalLink size={11} />
                    </a>
                  </div>
                </div>
              )}

              {/* 标题 & 时长 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                  <p className="text-xs text-gray-400 mb-1">推荐标题</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {dhScriptData.title || "—"}
                  </p>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                  <p className="text-xs text-gray-400 mb-1">预计时长</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {dhScriptData.duration_estimate || "—"}
                  </p>
                </div>
              </div>

              {/* AI 分析 */}
              {(dhScriptData.viral_logic || dhScriptData.style_applied) && (
                <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl space-y-1.5">
                  <div className="flex items-center gap-1.5 mb-2">
                    <BookOpen size={13} className="text-purple-500" />
                    <span className="text-xs font-medium text-purple-700 dark:text-purple-300">
                      创作依据
                    </span>
                  </div>
                  {dhScriptData.viral_logic && (
                    <p className="text-xs text-purple-700 dark:text-purple-300">
                      <span className="font-medium">爆款逻辑：</span>
                      {dhScriptData.viral_logic}
                    </p>
                  )}
                  {dhScriptData.style_applied && (
                    <p className="text-xs text-purple-700 dark:text-purple-300">
                      <span className="font-medium">风格应用：</span>
                      {dhScriptData.style_applied}
                    </p>
                  )}
                </div>
              )}

              {/* 文案编辑区 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    口播文案
                    {hasEdited && (
                      <span className="ml-2 text-xs text-blue-500 font-normal">（已编辑）</span>
                    )}
                  </label>
                  <span
                    className={cn(
                      "text-xs",
                      charCount > 1000
                        ? "text-red-500"
                        : charCount < 100
                        ? "text-amber-500"
                        : "text-gray-400"
                    )}
                  >
                    {charCount} 字
                    {charCount > 1000 && " · 偏长"}
                    {charCount < 100 && charCount > 0 && " · 偏短"}
                  </span>
                </div>
                <textarea
                  value={editedScript}
                  onChange={(e) => setEditedScript(e.target.value)}
                  rows={9}
                  className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-purple-400 dark:focus:ring-purple-600 placeholder-gray-400"
                  placeholder="AI 生成的文案将显示在这里，你可以直接编辑…"
                />
              </div>
            </div>
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
              <button
                onClick={() => setStep("word-count")}
                className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                <ChevronLeft size={14} />
                重新生成
              </button>
              <button
                onClick={() => setStep("character")}
                disabled={!editedScript.trim()}
                className={cn(
                  "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all",
                  !editedScript.trim()
                    ? "bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed"
                    : "bg-purple-600 hover:bg-purple-700 text-white shadow-sm hover:shadow-md"
                )}
              >
                下一步：选数字人
                <UserCircle2 size={15} />
              </button>
            </div>
          </>
        )}

        {/* ── Step 3: Character selection ── */}
        {step === "character" && (
          <>
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                选择将要呈现这段口播文案的数字人形象。
              </p>

              {characters.length === 0 ? (
                <button
                  type="button"
                  onClick={onAddCharacter}
                  className="w-full py-8 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-500 dark:text-gray-400 hover:border-purple-400 hover:text-purple-500 transition-colors flex flex-col items-center gap-2"
                >
                  <PlusCircle size={24} />
                  添加数字人形象
                </button>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {characters.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedCharacter(c.id)}
                      className={cn(
                        "relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all",
                        selectedCharacter === c.id
                          ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
                          : "border-gray-100 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                      )}
                    >
                      {c.avatar ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={c.avatar}
                          alt={c.name}
                          className="w-14 h-14 rounded-full object-cover border-2 border-white dark:border-gray-700 shadow-sm"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                          <UserCircle2 size={28} className="text-gray-400" />
                        </div>
                      )}
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300 text-center truncate w-full">
                        {c.name}
                      </span>
                      {selectedCharacter === c.id && (
                        <span className="absolute top-2 right-2">
                          <CheckCircle2 size={14} className="text-purple-500" />
                        </span>
                      )}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={onAddCharacter}
                    className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-purple-400 hover:text-purple-500 text-gray-400 transition-colors min-h-[90px]"
                  >
                    <PlusCircle size={20} />
                    <span className="text-xs">添加形象</span>
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
              <button
                onClick={() => setStep("preview")}
                disabled={isConfirming}
                className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors disabled:opacity-40"
              >
                <ChevronLeft size={14} />
                返回文案
              </button>
              <button
                onClick={handleConfirmVideo}
                disabled={isConfirming || !selectedCharacter}
                className={cn(
                  "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all",
                  isConfirming || !selectedCharacter
                    ? "bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed"
                    : "bg-purple-600 hover:bg-purple-700 text-white shadow-sm hover:shadow-md"
                )}
              >
                {isConfirming ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    生成视频中…
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    确认生成视频
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
