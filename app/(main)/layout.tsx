'use client';

import { ReactNode, useEffect } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ApiKeyModal } from "@/components/ApiKeyModal";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { toast } from "react-hot-toast";
import { useTenant } from "@/hooks/useTenant";

export default function MainLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { basePath } = useTenant();
  const tenantLoginPath = `${basePath || ''}/login`;

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

  return (
    <div className="flex w-full h-full">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-8 dark:text-gray-100">
        {children}
      </main>
      <ApiKeyModal />
    </div>
  );
}
