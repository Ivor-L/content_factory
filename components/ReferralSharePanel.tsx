'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { buildReferralLink } from '@/lib/referrals';
import { Copy, RefreshCcw, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getProfileInitial } from '@/lib/profile';

interface ReferralInvitee {
  bindingId: string;
  inviteeId: string;
  createdAt: string;
  source: string | null;
  name: string | null;
  avatarUrl: string | null;
  totalConsumed: number | null;
  usageEventCount: number | null;
  usageTruncated: boolean;
  lastUsageAt: string | null;
}

interface ReferralsResponse {
  ok?: boolean;
  shareCode?: string;
  boundTo?: {
    referrerId: string;
    createdAt: string;
    name: string | null;
    avatarUrl: string | null;
  } | null;
  summary?: {
    inviteeCount: number;
    totalConsumed: number;
  };
  invitees?: ReferralInvitee[];
  error?: string;
}

interface Props {
  basePath: string;
  labels: any;
  showHeader?: boolean;
  showRefreshButton?: boolean;
}

export interface ReferralSharePanelHandle {
  refresh: () => Promise<void>;
}

export const ReferralSharePanel = forwardRef<ReferralSharePanelHandle, Props>(function ReferralSharePanel(
  { basePath, labels, showHeader = true, showRefreshButton = true },
  ref
) {
  const [data, setData] = useState<ReferralsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setError(labels?.userBlock?.referrals?.loginRequired || '请先登录后再查看');
        setData(null);
        return;
      }
      const res = await fetch('/api/referrals', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
      });
      const payload: ReferralsResponse = await res.json().catch(() => ({ error: 'Failed to parse response' }));
      if (!res.ok) {
        setError(payload.error || labels?.userBlock?.referrals?.loadFailed || '加载失败');
        setData(null);
        return;
      }
      setData(payload);
    } catch (err) {
      console.error('Failed to fetch referrals', err);
      setError(labels?.userBlock?.referrals?.loadFailed || '加载失败');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [labels]);

  useEffect(() => {
    if (!data && !loading) {
      void fetchData();
    }
  }, [data, loading, fetchData]);

  const shareCode = data?.shareCode;

  const shareLink = useMemo(() => {
    if (!origin || !shareCode) return '';
    return buildReferralLink(origin, basePath, shareCode);
  }, [origin, basePath, shareCode]);

  const handleCopy = async () => {
    if (!shareLink) return;
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      console.warn('Clipboard API unavailable');
      return;
    }
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy referral link', err);
    }
  };

  const title = labels?.userBlock?.referrals?.title || '分享有礼';
  const subtitle = labels?.userBlock?.referrals?.subtitle || '邀请好友注册，查看绑定与消耗情况';
  const linkLabel = labels?.userBlock?.referrals?.linkLabel || '专属注册链接';
  const copyLabel = copied
    ? labels?.userBlock?.referrals?.copied || '已复制'
    : labels?.userBlock?.referrals?.copy || '复制链接';
  const summaryLabels = labels?.userBlock?.referrals || {};
  const showTopBar = showHeader || showRefreshButton;

  useImperativeHandle(
    ref,
    () => ({
      refresh: () => fetchData(),
    }),
    [fetchData]
  );

  return (
    <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white/80 dark:bg-gray-900/60 shadow-sm backdrop-blur-sm">
      {showTopBar && (
        <div
          className={cn(
            'flex flex-col gap-4 px-4 pt-4 tablet:flex-row tablet:items-start tablet:px-6 tablet:pt-6',
            showHeader ? 'tablet:justify-between' : 'tablet:justify-end'
          )}
        >
          {showHeader && (
            <div>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">{title}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{subtitle}</p>
            </div>
          )}
          {showRefreshButton && (
            <button
              type="button"
              onClick={() => fetchData()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800 tablet:w-auto tablet:min-w-[160px]"
              aria-label={labels?.userBlock?.referrals?.refresh || '刷新'}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
              <span>{labels?.userBlock?.referrals?.refresh || '刷新'}</span>
            </button>
          )}
        </div>
      )}

      <div
        className={cn(
          'px-4 pb-4 space-y-6 tablet:px-6 tablet:pb-6',
          !showTopBar && 'pt-4 tablet:pt-6'
        )}
      >
        <div className="space-y-3">
          <div className="bg-gray-50 dark:bg-gray-800/70 rounded-xl px-3 py-4 tablet:px-4">
            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{linkLabel}</p>
            <div className="mt-2 flex flex-col gap-3 tablet:flex-row tablet:items-center">
              <div className="flex-1 w-full text-sm font-mono break-all text-gray-800 dark:text-gray-100 bg-white dark:bg-gray-900/60 rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-700 min-h-[3rem]">
                {shareLink || labels?.userBlock?.referrals?.linkPlaceholder || '登录后生成链接'}
              </div>
              <button
                type="button"
                disabled={!shareLink}
                onClick={handleCopy}
                className={cn(
                  'inline-flex w-full items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors min-h-11 tablet:w-auto tablet:min-w-[160px]',
                  shareLink
                    ? 'bg-black text-white hover:bg-gray-900 dark:bg-white dark:text-black'
                    : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                )}
              >
                <Copy className="w-4 h-4" />
                {copyLabel}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 xs:grid-cols-2">
            <div className="rounded-xl border border-gray-100 dark:border-gray-700 px-4 py-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">{summaryLabels.inviteeCountLabel || '绑定用户'}</p>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
                {data?.summary?.inviteeCount ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-gray-100 dark:border-gray-700 px-4 py-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">{summaryLabels.totalConsumedLabel || '累计消耗'}</p>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
                {(data?.summary?.totalConsumed ?? 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1 tablet:max-h-[420px]">
          {error ? (
            <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/30 dark:text-red-200 rounded-lg px-4 py-3">
              {error}
            </p>
          ) : loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div key={idx} className="h-14 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
              ))}
            </div>
          ) : (data?.invitees?.length ?? 0) === 0 ? (
            <div className="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/40 rounded-lg px-4 py-6 text-center">
              {summaryLabels.empty || '还没有绑定的用户'}
            </div>
          ) : (
            <div className="space-y-2">
              {data?.invitees?.map((invitee) => (
                <InviteeRow
                  key={invitee.bindingId}
                  invitee={invitee}
                  labels={summaryLabels}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

function InviteeRow({ invitee, labels }: { invitee: ReferralInvitee; labels: any }) {
  const name = invitee.name?.trim() || truncateId(invitee.inviteeId);
  const consumedLabel = labels?.consumedUnit || '消耗';
  const created = formatDate(invitee.createdAt);
  const consumedText =
    typeof invitee.totalConsumed === 'number'
      ? invitee.totalConsumed.toLocaleString()
      : '—';
  const avatarContent = invitee.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={invitee.avatarUrl} alt={name} className="w-full h-full object-cover" />
  ) : (
    <span className="text-xs font-semibold text-gray-600 dark:text-gray-200">
      {getProfileInitial(name)}
    </span>
  );

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-gray-100 dark:border-gray-700 px-3 py-2 xs:flex-row xs:items-center">
      <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden flex items-center justify-center self-start xs:self-auto">
        {avatarContent}
      </div>
      <div className="flex-1 min-w-0 w-full">
        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{name}</p>
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          {labels?.boundAtLabel || '绑定于'} {created}
        </p>
      </div>
      <div className="text-left xs:text-right w-full xs:w-auto">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">{consumedText}</p>
        <p className="text-[11px] text-gray-500 dark:text-gray-400">{consumedLabel}</p>
      </div>
    </div>
  );
}

function truncateId(value: string) {
  if (!value) return '未知用户';
  return value.length > 8 ? `${value.slice(0, 4)}…${value.slice(-4)}` : value;
}

function formatDate(input: string | null) {
  if (!input) return '';
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).format(new Date(input));
  } catch {
    return input;
  }
}
