"use client";

import { useEffect, useState, useCallback } from "react";
import { KnowledgeVideoForm, KnowledgeVideoMode } from "@/components/creative/KnowledgeVideoForm";
import { Loader2, Clapperboard } from "lucide-react";
import { toast } from "react-hot-toast";
import { supabase } from "@/lib/supabaseClient";

interface KnowledgeVideoTask {
  id: string;
  title?: string | null;
  videoType: KnowledgeVideoMode;
  status: string;
  createdAt: string;
  videoUrl?: string | null;
  error?: string | null;
}

export function KnowledgeVideoWorkspace() {
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState<KnowledgeVideoTask[]>([]);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [requiresAuth, setRequiresAuth] = useState(false);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const token = data.session?.access_token ?? null;
      setAuthToken(token);
      setRequiresAuth(!token);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const token = session?.access_token ?? null;
      setAuthToken(token);
      setRequiresAuth(!token);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const fetchTasks = useCallback(async () => {
    if (!authToken) {
      setRequiresAuth(true);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/knowledge-videos", {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const raw = await res.text();
      let payload: any = {};
      if (raw) {
        try {
          payload = JSON.parse(raw);
        } catch {
          payload = {};
        }
      }
      if (!res.ok) {
        throw new Error(payload.error || raw || "加载失败");
      }
      setTasks(Array.isArray(payload.data) ? payload.data : []);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  const handleCreate = async (payload: {
    mode: KnowledgeVideoMode;
    scriptContent: string;
    themeKey: string;
    timelineJson?: string;
  }) => {
    if (!authToken) {
      toast.error("请先登录后再试");
      setRequiresAuth(true);
      return;
    }
    try {
      let timeline: unknown;
      if (payload.timelineJson) {
        try {
          timeline = JSON.parse(payload.timelineJson);
        } catch (parseError) {
          toast.error("画面节奏 JSON 格式无效，请检查是否为合法 JSON。");
          return;
        }
      }

      const body = {
        videoType: payload.mode,
        scriptContent: payload.scriptContent,
        themeKey: payload.themeKey,
        metadata: { themeKey: payload.themeKey },
        timeline,
      };
      const res = await fetch("/api/knowledge-videos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(body),
      });
      const raw = await res.text();
      let response: any = {};
      if (raw) {
        try {
          response = JSON.parse(raw);
        } catch {
          response = {};
        }
      }
      if (!res.ok) {
        throw new Error(response.error || raw || "创建失败");
      }
      toast.success("已创建知识视频任务");
      setTasks((prev) => [response.data, ...prev]);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "创建失败");
    }
  };

  return (
    <section className="rounded-3xl border border-gray-100 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-black text-white dark:bg-white dark:text-black">
            <Clapperboard className="w-5 h-5" />
          </span>
          <div>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">知识讲解视频</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              通过 Remotion 自动完成字幕包装与知识动画。
            </p>
          </div>
        </div>
        <KnowledgeVideoForm onSubmit={handleCreate} />
      </div>

      <div className="mt-10">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">最近任务</p>
        {requiresAuth && (
          <p className="mt-2 text-xs text-amber-600">请先登录后查看知识视频任务。</p>
        )}
        {loading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载中...
          </div>
        ) : tasks.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">暂无任务，提交脚本即可生成视频。</p>
        ) : (
          <ul className="mt-4 divide-y divide-gray-100 text-sm dark:divide-gray-800">
            {tasks.map((task) => (
              <li key={task.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {task.title || (task.videoType === "subtitle_wrap" ? "字幕包装" : "知识动画")}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(task.createdAt).toLocaleString()} · 状态：{task.status}
                  </p>
                </div>
                {task.videoUrl ? (
                  <a
                    href={task.videoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-semibold text-indigo-600 hover:underline"
                  >
                    查看
                  </a>
                ) : task.error ? (
                  <span className="text-xs text-red-500">{task.error}</span>
                ) : (
                  <span className="text-xs text-gray-400">渲染中…</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
