'use client';

import { ReactNode, useEffect } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ApiKeyModal } from "@/components/ApiKeyModal";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { toast } from "react-hot-toast";
import { useTenant } from "@/hooks/useTenant";
import { AuthSessionSync } from "@/components/AuthSessionSync";
import { ReferralBindingWatcher } from "@/components/ReferralBindingWatcher";
import { CanvasShellProvider, useCanvasShell } from "@/contexts/CanvasShellContext";
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

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push(tenantLoginPath);
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('plan, plan_expires_at, is_banned')
        .eq('id', session.user.id)
        .maybeSingle();

      if (profile?.is_banned) {
        router.push(`${basePath || ''}/banned`);
        return;
      }

      if (profile && profile.plan !== 'free' && profile.plan_expires_at) {
        const isExpired = new Date(profile.plan_expires_at) < new Date();
        if (isExpired) {
          router.push(`${basePath || ''}/expired`);
          return;
        }
      }
    };

    checkSession();
  }, [router, tenantLoginPath, basePath]);

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

  return (
    <div className="flex h-full w-full">
      <AuthSessionSync />
      <ReferralBindingWatcher />
      {showSidebar && <Sidebar />}
      <div className="flex min-w-0 flex-1 flex-col">
        <main className={`flex-1 min-w-0 overflow-y-auto bg-transparent dark:text-gray-100 ${mainSpacingClass}`}>
          {children}
        </main>
      </div>
      <CanvasAgentDrawer />
      <ApiKeyModal />
    </div>
  );
}
