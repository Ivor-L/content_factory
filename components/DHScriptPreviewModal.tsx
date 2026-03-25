"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "react-hot-toast";
import { X, Sparkles, BookOpen, AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
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

interface DHScriptPreviewModalProps {
  replicationId: string;
  scriptData: DHScriptData;
  authToken: string;
  onConfirmed: (videoId: string) => void;
  onClose: () => void;
}

export function DHScriptPreviewModal({
  replicationId,
  scriptData,
  authToken,
  onConfirmed,
  onClose,
}: DHScriptPreviewModalProps) {
  const [editedScript, setEditedScript] = useState(scriptData.script_content);
  const [isConfirming, setIsConfirming] = useState(false);
  const resourcesPath = useTenantPath("/resources");

  const charCount = editedScript.length;
  const hasEdited = editedScript !== scriptData.script_content;

  async function handleConfirm() {
    if (!editedScript.trim()) {
      toast.error("文案内容不能为空");
      return;
    }
    setIsConfirming(true);
    try {
      const res = await fetch("/api/replication/digital-human/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          replicationId,
          scriptContent: editedScript,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `请求失败 ${res.status}`);
      }
      toast.success("视频生成已启动，请稍候");
      onConfirmed(data.data?.videoId ?? "");
    } catch (err: any) {
      toast.error(err.message || "确认失败，请重试");
    } finally {
      setIsConfirming(false);
    }
  }

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-purple-500" />
            <h2 className="font-semibold text-gray-900 dark:text-white text-base">
              AI 生成文案预览
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {/* 历史数据不足提示 */}
          {scriptData.needs_more_history && (
            <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl">
              <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  历史文案数据不足
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  {scriptData.data_suggestion || "上传更多历史文案后，AI 将能更好地模仿你的写作风格"}
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
                {scriptData.title || "—"}
              </p>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <p className="text-xs text-gray-400 mb-1">预计时长</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {scriptData.duration_estimate || "—"}
              </p>
            </div>
          </div>

          {/* AI 分析信息 */}
          {(scriptData.viral_logic || scriptData.style_applied) && (
            <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl space-y-1.5">
              <div className="flex items-center gap-1.5 mb-2">
                <BookOpen size={13} className="text-purple-500" />
                <span className="text-xs font-medium text-purple-700 dark:text-purple-300">
                  创作依据
                </span>
              </div>
              {scriptData.viral_logic && (
                <p className="text-xs text-purple-700 dark:text-purple-300">
                  <span className="font-medium">爆款逻辑：</span>
                  {scriptData.viral_logic}
                </p>
              )}
              {scriptData.style_applied && (
                <p className="text-xs text-purple-700 dark:text-purple-300">
                  <span className="font-medium">风格应用：</span>
                  {scriptData.style_applied}
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
                  charCount > 280
                    ? "text-red-500"
                    : charCount < 150
                    ? "text-amber-500"
                    : "text-gray-400"
                )}
              >
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
            <p className="text-xs text-gray-400 mt-1.5">
              建议 150-280 字（约 30-65 秒口播时长）
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={isConfirming || !editedScript.trim()}
            className={cn(
              "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all",
              isConfirming || !editedScript.trim()
                ? "bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed"
                : "bg-purple-600 hover:bg-purple-700 text-white shadow-sm hover:shadow-md"
            )}
          >
            {isConfirming ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                生成视频中...
              </>
            ) : (
              <>
                <CheckCircle2 size={16} />
                确认并生成视频
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
