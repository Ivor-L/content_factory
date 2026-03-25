'use client';

import { ReactNode, useEffect, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ApiKeyModal } from "@/components/ApiKeyModal";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { toast } from "react-hot-toast";
import { useTenant } from "@/hooks/useTenant";
import { AuthSessionSync } from "@/components/AuthSessionSync";

export default function MainLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { basePath } = useTenant();
  const tenantLoginPath = `${basePath || ''}/login`;
  const canvasBasePath = `${basePath || ''}/canvas`;
  const isCanvasPage = pathname?.includes('/canvas');
  const tightenStoryboardSpacing = pathname?.includes('/storyboard/create');
  const isStoryboardDetail = pathname ? /\/storyboard\/[^/]+/.test(pathname) && !pathname.includes('/storyboard/create') && !pathname.endsWith('/storyboard') : false;
  const [isCanvasDetailView, setIsCanvasDetailView] = useState(false);
  const mainSpacingClass = isCanvasPage
    ? 'p-0'
    : isStoryboardDetail
      ? 'p-0'
      : tightenStoryboardSpacing
        ? 'px-8 pb-8 pt-0 sm:pt-0'
        : 'p-8';
  const showSidebar = !isCanvasDetailView;

  useEffect(() => {
    const checkSession = async () => {
      // 1. Check for 5-day session limit
      const loginTimestamp = localStorage.getItem('login_timestamp');
      if (loginTimestamp) {
        const daysSinceLogin = (Date.now() - parseInt(loginTimestamp)) / (1000 * 60 * 60 * 24);
        if (daysSinceLogin > 5) {
          await supabase.auth.signOut();
          localStorage.removeItem('login_timestamp');
          toast.error('Session expired. Please login again.');
          router.push(tenantLoginPath);
          return;
        }
      }

      // 2. Check if user is authenticated
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push(tenantLoginPath);
      }
    };

    checkSession();
  }, [router, tenantLoginPath]);

  useEffect(() => {
    if (!pathname?.includes('/canvas')) {
      setIsCanvasDetailView(false);
    }
  }, [pathname]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (typeof window === 'undefined') return;
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'canvas-enter') {
        setIsCanvasDetailView(true);
      } else if (data.type === 'canvas-exit') {
        setIsCanvasDetailView(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  return (
    <div className="flex w-full h-full">
      <AuthSessionSync />
      {showSidebar && <Sidebar />}
      <main className={`flex-1 min-w-0 overflow-y-auto dark:text-gray-100 ${mainSpacingClass}`}>
        {children}
      </main>
      <ApiKeyModal />
    </div>
  );
}
