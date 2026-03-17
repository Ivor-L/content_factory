'use client';

import { useRef, useState } from 'react';
import { RefreshCcw, Loader2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTenant } from '@/hooks/useTenant';
import { ReferralSharePanel } from '@/components/ReferralSharePanel';
import type { ReferralSharePanelHandle } from '@/components/ReferralSharePanel';

export default function ReferralSharePage() {
  const { t } = useLanguage();
  const { basePath } = useTenant();
  const panelRef = useRef<ReferralSharePanelHandle>(null);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (!panelRef.current?.refresh || refreshing) return;
    setRefreshing(true);
    try {
      await panelRef.current.refresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="w-full px-6 py-10">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">
              {t.userBlock?.referrals?.title || '分享有礼'}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              {t.userBlock?.referrals?.subtitle || '邀请好友注册，查看绑定与消耗情况'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
            <span>{t.userBlock?.referrals?.refresh || '刷新'}</span>
          </button>
        </div>

        <ReferralSharePanel
          ref={panelRef}
          basePath={basePath}
          labels={t}
          showHeader={false}
          showRefreshButton={false}
        />
      </div>
    </div>
  );
}
