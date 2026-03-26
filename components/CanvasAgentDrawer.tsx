"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Loader2, SendHorizonal, X } from "lucide-react";
import { toast } from "react-hot-toast";
import { useCanvasShell, type CanvasShellCommands } from "@/contexts/CanvasShellContext";

type CanvasAgentEventDetail = {
  projectId?: string | null;
  nodeId?: string | null;
  commands?: CanvasShellCommands;
};

function extractAgentText(payload: unknown): string | null {
  if (!payload) return null;
  if (typeof payload === "string") return payload;
  if (Array.isArray(payload)) {
    const merged = payload.map((item) => extractAgentText(item)).filter(Boolean).join(" ").trim();
    return merged || null;
  }
  if (typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  if (typeof record.content === "string") return record.content;
  if (Array.isArray(record.content)) {
    const merged = record.content
      .map((item) =>
        typeof item === "string"
          ? item
          : typeof item === "object" && item && typeof (item as { text?: string }).text === "string"
            ? (item as { text?: string }).text
            : "",
      )
      .join("")
      .trim();
    if (merged) return merged;
  }
  if (typeof record.text === "string") return record.text;
  if (record.data) {
    const nested = extractAgentText(record.data);
    if (nested) return nested;
  }
  if (Array.isArray(record.messages)) {
    const last = [...record.messages].reverse().find((msg) => (msg as { role?: string }).role === "assistant");
    const fromMessages = extractAgentText(last ?? record.messages[0]);
    if (fromMessages) return fromMessages;
  }
  if (Array.isArray(record.choices) && record.choices.length > 0) {
    const choice = record.choices[0] as Record<string, unknown>;
    const fromChoice = extractAgentText(choice.message ?? choice.delta ?? choice);
    if (fromChoice) return fromChoice;
  }
  if (typeof record.result === "string") return record.result;
  return null;
}

export function CanvasAgentDrawer() {
  const { state, commands } = useCanvasShell();
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [responseText, setResponseText] = useState<string | null>(null);
  const [overrideProjectId, setOverrideProjectId] = useState<string | null>(null);
  const [targetNodeId, setTargetNodeId] = useState<string | null>(null);
  const [externalCommands, setExternalCommands] = useState<CanvasShellCommands>(null);

  const effectiveProjectId = overrideProjectId || state.projectId;
  const effectiveCommands = externalCommands ?? commands;

  const closeDrawer = useCallback(() => {
    setIsOpen(false);
    setPrompt("");
    setResponseText(null);
    setError(null);
    setExternalCommands(null);
    setOverrideProjectId(null);
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<CanvasAgentEventDetail>).detail;
      setIsOpen(true);
      setError(null);
      setResponseText(null);
      setExternalCommands(detail?.commands ?? null);
      setOverrideProjectId(detail?.projectId ?? null);
      setTargetNodeId(detail?.nodeId ?? state.currentNodeId ?? null);
    };
    window.addEventListener("canvas-agent:open", handler as EventListener);
    return () => window.removeEventListener("canvas-agent:open", handler as EventListener);
  }, [state.currentNodeId]);

  useEffect(() => {
    if (!state.active) {
      closeDrawer();
    }
  }, [closeDrawer, state.active]);

  const handleSubmit = useCallback(async () => {
    if (!effectiveProjectId) {
      toast.error("请先选择一个画布项目");
      return;
    }
    const nodeId = targetNodeId || state.currentNodeId;
    if (!nodeId) {
      toast.error("请在画布中选中要写入的节点");
      return;
    }
    if (!prompt.trim()) {
      toast.error("请输入提示内容");
      return;
    }
    if (!effectiveCommands?.patchNode) {
      toast.error("节点指令暂不可用，请稍后重试");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/canvas/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: effectiveProjectId,
          messages: [
            {
              role: "system",
              content: "你是 NexTide 无限画布的智能助理，请根据用户的提示补全可供节点使用的内容。",
            },
            { role: "user", content: prompt.trim() },
          ],
          stream: false,
        }),
      });
      let agentText: string | null = null;
      if (response.ok) {
        const payload = await response.json().catch(() => null);
        agentText = extractAgentText(payload);
      } else {
        const payload = await response.json().catch(() => null);
        const message =
          (payload as { error?: { message?: string } })?.error?.message || response.statusText;
        throw new Error(message || "生成失败");
      }
      if (!agentText) {
        agentText = prompt.trim();
      }
      const patched = effectiveCommands.patchNode(nodeId, { content: agentText });
      if (!patched) {
        throw new Error("节点不可写入，请确认已选中正确节点");
      }
      setResponseText(agentText);
      setPrompt("");
      toast.success("已写入节点");
    } catch (err) {
      const message = err instanceof Error ? err.message : "生成失败，请稍后重试";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }, [effectiveCommands, effectiveProjectId, prompt, state.currentNodeId, targetNodeId]);

  const disabled =
    !effectiveProjectId || !(targetNodeId || state.currentNodeId) || submitting || !state.active;

  const title = useMemo(() => state.projectName || "未命名项目", [state.projectName]);
  const nodeLabel = useMemo(
    () =>
      state.currentNodeLabel ||
      (targetNodeId ? `节点 ${targetNodeId.slice(0, 6)}` : "当前节点未选择"),
    [state.currentNodeLabel, targetNodeId],
  );

  return (
    <div
      className={clsx(
        "pointer-events-none fixed inset-0 z-40 flex justify-end",
        isOpen && state.active ? "pointer-events-auto" : "pointer-events-none",
      )}
      aria-hidden={!isOpen}
    >
      <div
        className={clsx(
          "absolute inset-0 bg-black/50 transition-opacity",
          isOpen ? "opacity-100" : "opacity-0",
        )}
        onClick={closeDrawer}
      />
      <aside
        className={clsx(
          "relative flex h-full w-full max-w-md flex-col bg-[#0b0d17] text-white shadow-[0_25px_80px_rgba(0,0,0,0.55)] transition-transform duration-300",
          isOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        <header className="flex items-start justify-between border-b border-white/10 px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-white/50">AI 助理 · 无限画布</p>
            <h2 className="mt-1 text-lg font-semibold">{title}</h2>
            <p className="text-[12px] text-white/60">写入节点：{nodeLabel}</p>
          </div>
          <button
            type="button"
            onClick={closeDrawer}
            className="rounded-full border border-white/20 p-1 text-white/70 transition hover:border-white/60"
            aria-label="关闭助手"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-[0.2em] text-white/40">目标节点 ID</label>
              <input
                value={targetNodeId ?? state.currentNodeId ?? ""}
                onChange={(event) => setTargetNodeId(event.target.value.trim() || null)}
                placeholder="默认使用当前选中节点"
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-white outline-none focus:border-white/40"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.2em] text-white/40">创意提示</label>
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="描述你想要的脚本、提示词或画面…"
                className="mt-2 h-36 w-full resize-none rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none focus:border-white/40"
              />
            </div>
            {error && (
              <div className="rounded-xl border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-xs text-rose-100">
                {error}
              </div>
            )}
            {responseText && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/80">
                <p className="text-xs uppercase tracking-[0.2em] text-white/40">最近输出</p>
                <p className="mt-2 whitespace-pre-line leading-relaxed">{responseText}</p>
              </div>
            )}
          </div>
        </div>
        <footer className="border-t border-white/10 px-6 py-5">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={disabled}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#ffc94a] px-4 py-3 text-sm font-semibold text-black shadow-[0_0_20px_rgba(255,201,74,0.45)] transition hover:bg-[#ffd86f] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                正在生成…
              </>
            ) : (
              <>
                <SendHorizonal className="h-4 w-4" />
                提交并写入节点
              </>
            )}
          </button>
        </footer>
      </aside>
    </div>
  );
}
