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
    <div className="w-full px-4 py-6 xs:px-5 tablet:px-6 tablet:py-10 pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-4xl mx-auto w-full space-y-6">
        <div className="flex flex-col gap-4 tablet:flex-row tablet:items-center tablet:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white xs:text-3xl">
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
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-3 text-base text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800 tablet:w-auto tablet:min-w-[160px]"
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
