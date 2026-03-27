'use client';

import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { AlertCircle, LogOut } from 'lucide-react';

export default function ExpiredPage() {
  const router = useRouter();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('login_timestamp');
    router.push('/login');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-8 text-center">
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">账号已过期</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-8">
          您的会员已到期，请续费后继续使用。如需帮助，请联系客服。
        </p>

        <div className="space-y-3">
          <a
            href="https://work.weixin.qq.com/kfid/kfc9be8fef65f3e4ad2"
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full py-3 px-4 bg-black dark:bg-white text-white dark:text-black font-semibold rounded-xl hover:opacity-90 transition-opacity"
          >
            联系客服续费
          </a>
          <button
            onClick={handleSignOut}
            className="flex items-center justify-center gap-2 w-full py-3 px-4 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <LogOut size={16} />
            退出登录
          </button>
        </div>
      </div>
    </div>
  );
}
