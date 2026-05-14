'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Crown, Sun, Moon } from 'lucide-react';
import { isEarnMarketEnabled } from '@/lib/earnFeatureFlag';

type AdminNavItem = {
  href: string;
  label: string;
};

function isAdminNavItem(item: AdminNavItem | false): item is AdminNavItem {
  return Boolean(item);
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('admin-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = stored ? stored === 'dark' : prefersDark;
    setDark(isDark);
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [dark]);

  const toggleTheme = () => {
    setDark((d) => {
      const next = !d;
      if (next) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      localStorage.setItem('admin-theme', next ? 'dark' : 'light');
      return next;
    });
  };

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
          {([
            { href: '/admin/dashboard', label: '数据仪表盘' },
            { href: '/admin',           label: '用户管理' },
            { href: '/admin/credits',   label: '积分配置' },
            { href: '/admin/monetization-square',   label: '变现广场' },
            isEarnMarketEnabled && { href: '/admin/earn', label: '淘金任务' },
            { href: '/admin/hot-square-data-center', label: '爆款数据中心' },
            { href: '/admin/tenants',   label: '租户管理' },
          ] as Array<AdminNavItem | false>).filter(isAdminNavItem).map(({ href, label }) => {
            const isActive = href === '/admin' ? pathname === '/admin' : pathname?.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`text-sm px-3 py-1.5 rounded-lg transition-colors font-medium ${
                  isActive
                    ? 'bg-gray-900 dark:bg-white text-white dark:text-black'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <button
            suppressHydrationWarning
            onClick={toggleTheme}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm"
          >
            {dark ? <Sun size={14} /> : <Moon size={14} />}
            {dark ? '亮色' : '暗色'}
          </button>
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
