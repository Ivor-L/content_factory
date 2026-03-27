'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Crown } from 'lucide-react';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login'); return; }

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', session.user.id)
        .maybeSingle();

      if (!profile?.is_admin) router.push('/dashboard');
    };
    check();
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 px-6 py-3.5 flex items-center gap-4 sticky top-0 z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-black dark:bg-white flex items-center justify-center">
            <Crown size={13} className="text-white dark:text-black" />
          </div>
          <span className="font-bold text-gray-900 dark:text-white">管理后台</span>
        </div>
        <nav className="flex gap-1 ml-2">
          <a
            href="/admin"
            className="text-sm px-3 py-1.5 rounded-lg text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors font-medium"
          >
            用户管理
          </a>
        </nav>
        <div className="ml-auto">
          <a
            href="/dashboard"
            className="text-sm text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors flex items-center gap-1"
          >
            ← 返回应用
          </a>
        </div>
      </header>
      <main className="p-6 md:p-8">{children}</main>
    </div>
  );
}
