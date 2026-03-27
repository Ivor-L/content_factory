'use client';

import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { ShieldOff } from 'lucide-react';

export default function BannedPage() {
  const router = useRouter();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-900/20 flex items-center justify-center mx-auto mb-6">
          <ShieldOff size={28} className="text-red-500" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">账号已被封禁</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-8 leading-relaxed">
          你的账号因违反使用条款已被管理员封禁。<br />
          如需申诉，请联系客服处理。
        </p>
        <button
          onClick={handleSignOut}
          className="px-6 py-2.5 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          退出登录
        </button>
      </div>
    </div>
  );
}
