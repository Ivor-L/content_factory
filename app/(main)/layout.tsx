'use client';

import { ReactNode, useCallback, useEffect, useMemo } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ApiKeyModal } from "@/components/ApiKeyModal";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { toast } from "react-hot-toast";
import { useTenant } from "@/hooks/useTenant";
import { AuthSessionSync } from "@/components/AuthSessionSync";
import { CanvasShellProvider, useCanvasShell } from "@/contexts/CanvasShellContext";
import { Sparkles } from "lucide-react";
import { CanvasAgentDrawer } from "@/components/CanvasAgentDrawer";

export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <CanvasShellProvider>
      <MainLayoutChrome>{children}</MainLayoutChrome>
    </CanvasShellProvider>
  );
}

function MainLayoutChrome({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { basePath } = useTenant();
  const tenantLoginPath = `${basePath || ""}/login`;
  const canvasBasePath = `${basePath || ""}/canvas`;
  const isCanvasPage = Boolean(pathname?.startsWith(canvasBasePath));
  const tightenStoryboardSpacing = pathname?.includes("/storyboard/create");
  const isStoryboardDetail = pathname
    ? /\/storyboard\/[^/]+/.test(pathname) &&
      !pathname.includes("/storyboard/create") &&
      !pathname.endsWith("/storyboard")
    : false;

  const {
    state: canvasShell,
    update: updateCanvasShell,
    reset: resetCanvasShell,
    commands: canvasCommands,
  } = useCanvasShell();

  const showSidebar = !canvasShell.active;
  const mainSpacingClass = isCanvasPage
    ? "p-0"
    : isStoryboardDetail
      ? "p-0"
      : tightenStoryboardSpacing
        ? "px-8 pb-8 pt-0 sm:pt-0"
        : "p-8";

  useEffect(() => {
    const checkSession = async () => {
      const loginTimestamp = localStorage.getItem("login_timestamp");
      if (loginTimestamp) {
        const daysSinceLogin = (Date.now() - parseInt(loginTimestamp, 10)) / (1000 * 60 * 60 * 24);
        if (daysSinceLogin > 5) {
          await supabase.auth.signOut();
          localStorage.removeItem("login_timestamp");
          toast.error("Session expired. Please login again.");
          router.push(tenantLoginPath);
          return;
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push(tenantLoginPath);
      }
    };

    checkSession();
  }, [router, tenantLoginPath]);

  useEffect(() => {
    if (!pathname?.includes("/canvas")) {
      resetCanvasShell();
    }
  }, [pathname, resetCanvasShell]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (typeof window === "undefined") return;
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.type === "canvas-enter") {
        updateCanvasShell((prev) => ({
          ...prev,
          active: true,
          projectId: data.projectId ?? prev.projectId,
          projectName: data.projectName ?? prev.projectName,
        }));
      } else if (data.type === "canvas-exit") {
        resetCanvasShell();
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [resetCanvasShell, updateCanvasShell]);

  const canvasReturnTo = searchParams?.get("returnTo") || null;
  const canvasBackTarget = canvasReturnTo || `${canvasBasePath}?view=projects`;

  const handleCanvasBack = useCallback(() => {
    router.push(canvasBackTarget);
    resetCanvasShell();
  }, [canvasBackTarget, resetCanvasShell, router]);

  const handleOpenAgentPanel = useCallback(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("canvas-agent:open", {
        detail: {
          projectId: canvasShell.projectId,
          nodeId: canvasShell.currentNodeId,
          commands: canvasCommands ?? undefined,
        },
      }),
    );
  }, [canvasCommands, canvasShell.currentNodeId, canvasShell.projectId]);

  const saveStatus = useMemo(() => {
    if (canvasShell.saveError) {
      return { label: canvasShell.saveError, tone: "error" as const };
    }
    if (canvasShell.isSaving) {
      return { label: "自动保存中…", tone: "muted" as const };
    }
    if (canvasShell.active) {
      return { label: "已自动保存", tone: "muted" as const };
    }
    return null;
  }, [canvasShell.active, canvasShell.isSaving, canvasShell.saveError]);

  return (
    <div className="flex h-full w-full">
      <AuthSessionSync />
      {showSidebar && <Sidebar />}
      <div className="flex min-w-0 flex-1 flex-col">
        {canvasShell.active && (
          <div className="sticky top-0 z-30 border-b border-white/10 bg-[#05060c]/95 px-6 py-3 text-white backdrop-blur">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={handleCanvasBack}
                  className="inline-flex items-center gap-2 rounded-full border border-white/30 px-3 py-1 text-xs text-white transition hover:border-white/60"
                >
                  ← 返回
                </button>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">无限画布</p>
                  <h1 className="text-base font-semibold">
                    {canvasShell.projectName || "未命名项目"}
                  </h1>
                  {canvasShell.currentNodeLabel && (
                    <p className="text-[11px] text-white/60">
                      当前节点 · {canvasShell.currentNodeLabel}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                {saveStatus && (
                  <span
                    className={
                      saveStatus.tone === "error"
                        ? "text-rose-300"
                        : "text-white/70"
                    }
                  >
                    {saveStatus.label}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 rounded-full border border-white/20 px-3 py-1 text-white/70">
                  <Sparkles className="h-4 w-4" /> Preview
                </span>
                <button
                  type="button"
                  onClick={handleOpenAgentPanel}
                  className="inline-flex items-center gap-2 rounded-full border border-white/30 px-3 py-1 text-white transition hover:border-white/60"
                >
                  AI 助理
                </button>
              </div>
            </div>
          </div>
        )}
        <main className={`flex-1 min-w-0 overflow-y-auto bg-transparent dark:text-gray-100 ${mainSpacingClass}`}>
          {children}
        </main>
      </div>
      <CanvasAgentDrawer />
      <ApiKeyModal />
    </div>
  );
}
