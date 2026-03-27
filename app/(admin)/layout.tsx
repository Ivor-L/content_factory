'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

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
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center gap-4">
        <span className="font-bold text-lg text-gray-900 dark:text-white">管理后台</span>
        <nav className="flex gap-4 text-sm">
          <a href="/admin" className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">用户管理</a>
        </nav>
        <div className="ml-auto">
          <a href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white">← 返回应用</a>
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
