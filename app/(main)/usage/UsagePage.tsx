'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCcw, ArrowLeft, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/contexts/LanguageContext';
import type { UsageEvent, UsagePagination, UsageResponsePayload } from '@/types/credits';

const PAGE_SIZE = 20;

const getConsumedAmount = (event: UsageEvent): number => {
  if (typeof event.delta === 'number') {
    return event.delta < 0 ? Math.abs(event.delta) : 0;
  }
  if (typeof event.amount === 'number') {
    return Math.abs(event.amount);
  }
  return 0;
};

export default function UsagePage() {
  const { language, t } = useLanguage();
  const [events, setEvents] = useState<UsageEvent[]>([]);
  const [pagination, setPagination] = useState<UsagePagination>({
    page: 1,
    size: PAGE_SIZE,
    total: null,
    base: null
  });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const labels = useMemo(() => t.usagePage || {}, [t]);
  const summaryLabels = labels.summary || {};
  const tableLabels = labels.table || {};
  const paginationLabels = labels.pagination || {};
  const resolvedLocale = useMemo(() => {
    switch (language) {
      case 'zh':
        return 'zh-CN';
      case 'zh-TW':
        return 'zh-TW';
      default:
        return 'en-US';
    }
  }, [language]);

  const consumptionStats = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthLabel = new Intl.DateTimeFormat(resolvedLocale, { year: 'numeric', month: 'long' }).format(now);
    const todayLabel = new Intl.DateTimeFormat(resolvedLocale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).format(now);

    if (events.length === 0) {
      return {
        total: null,
        month: null,
        today: null,
        monthLabel,
        todayLabel
      };
    }

    const totals = events.reduce(
      (acc, event) => {
        const amount = getConsumedAmount(event);
        if (amount <= 0) return acc;

        acc.total += amount;

        if (event.createdAt) {
          const createdAt = new Date(event.createdAt);
          if (!Number.isNaN(createdAt.getTime())) {
            if (createdAt >= startOfMonth) {
              acc.month += amount;
            }
            if (createdAt >= startOfToday) {
              acc.today += amount;
            }
          }
        }

        return acc;
      },
      { total: 0, month: 0, today: 0 }
    );

    return {
      total: totals.total,
      month: totals.month,
      today: totals.today,
      monthLabel,
      todayLabel
    };
  }, [events, resolvedLocale]);

  const formatNumber = (value: number | null | undefined) =>
    typeof value === 'number' ? value.toLocaleString(resolvedLocale) : '—';

  const formatEventAmount = (event: UsageEvent) => {
    if (typeof event.delta === 'number') {
      const prefix = event.delta < 0 ? '-' : '+';
      return `${prefix}${Math.abs(event.delta).toLocaleString(resolvedLocale)}`;
    }
    if (typeof event.amount === 'number') {
      return `-${event.amount.toLocaleString(resolvedLocale)}`;
    }
    return '—';
  };

  const getAmountColorClass = (event: UsageEvent) => {
    if (typeof event.delta === 'number' && event.delta > 0) {
      return 'text-emerald-600 dark:text-emerald-400';
    }
    return 'text-rose-600 dark:text-rose-400';
  };

  const formatDateTime = (value: string | null | undefined) => {
    if (!value) return '—';
    try {
      return new Intl.DateTimeFormat(resolvedLocale, {
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(new Date(value));
    } catch {
      return value;
    }
  };

  const fetchUsage = useCallback(
    async (targetPage: number) => {
      try {
        setLoading(true);
        setError(null);

        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) {
          setEvents([]);
          setError(labels.loginRequired || '请先登录后查看积分记录');
          return;
        }

        const res = await fetch(`/api/integration/usage?page=${targetPage}&size=${PAGE_SIZE}`, {
          headers: {
            Authorization: `Bearer ${token}`
          },
          cache: 'no-store'
        });

        const payload = (await res.json().catch(() => ({}))) as UsageResponsePayload;

        if (!res.ok || !payload?.ok) {
          const message = payload?.error || labels.fetchFailed || '获取积分消耗失败';
          setEvents([]);
          setError(message);
          return;
        }

        setEvents(payload.events ?? []);
        setPagination({
          page: targetPage,
          size: payload.pagination?.size ?? PAGE_SIZE,
          total: payload.pagination?.total ?? null,
          base: payload.pagination?.base ?? null
        });
      } catch (err) {
        console.error('Failed to fetch usage events', err);
        setEvents([]);
        setError(labels.fetchFailed || '获取积分消耗失败');
      } finally {
        setLoading(false);
      }
    },
    [labels]
  );

  useEffect(() => {
    void fetchUsage(page);
  }, [page, fetchUsage]);

  const totalPages = useMemo(() => {
    if (pagination.total && pagination.size > 0) {
      return Math.max(1, Math.ceil(pagination.total / pagination.size));
    }
    return null;
  }, [pagination.total, pagination.size]);

  const canGoPrev = page > 1;
  const canGoNext = totalPages ? page < totalPages : events.length === pagination.size;

  const handlePrev = () => {
    if (canGoPrev) {
      setPage((prev) => Math.max(1, prev - 1));
    }
  };

  const handleNext = () => {
    if (canGoNext) {
      setPage((prev) => prev + 1);
    }
  };

  const handleRefresh = () => {
    void fetchUsage(page);
  };

  const formatPeriodHint = (template: string | undefined, fallback: string) =>
    template ? template.replace('{{period}}', fallback) : fallback;

  const summaryCards = [
    {
      title: summaryLabels.totalConsumed || '总消耗',
      value: formatNumber(consumptionStats.total),
      hint: summaryLabels.totalHint || ''
    },
    {
      title: summaryLabels.monthlyConsumed || '本月消耗',
      value: formatNumber(consumptionStats.month),
      hint: formatPeriodHint(summaryLabels.monthlyHint, consumptionStats.monthLabel)
    },
    {
      title: summaryLabels.todayConsumed || '今日消耗',
      value: formatNumber(consumptionStats.today),
      hint: formatPeriodHint(summaryLabels.todayHint, consumptionStats.todayLabel)
    }
  ];

  const pageLabel = totalPages && paginationLabels.pageOf
    ? paginationLabels.pageOf
        .replace('{{current}}', String(page))
        .replace('{{total}}', String(totalPages))
    : paginationLabels.pageLabel
      ? paginationLabels.pageLabel.replace('{{current}}', String(page))
      : `Page ${page}`;

  return (
    <div className="w-full px-6 py-10">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">
              {labels.title || '积分消耗记录'}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-2xl">
              {labels.subtitle || '查看每一次积分扣除与余额变动，便于审计与核对账单。'}
            </p>
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
            <span>{labels.refresh || '刷新'}</span>
          </button>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50/70 dark:border-red-900/40 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-200">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {summaryCards.map((card) => (
            <div
              key={card.title}
              className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white/80 dark:bg-gray-900/60 px-5 py-4 shadow-sm"
            >
              <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {card.title}
              </p>
              <p className="text-3xl font-semibold text-gray-900 dark:text-white mt-2">
                {card.value}
              </p>
              {card.hint && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  {card.hint}
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white/80 dark:bg-gray-900/60 shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-gray-500 dark:text-gray-400 animate-spin" />
            </div>
          ) : events.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">
              {tableLabels.empty || '暂无积分消耗记录'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800 text-sm">
                <thead className="bg-gray-50/70 dark:bg-gray-900/40">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {tableLabels.time || '时间'}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {tableLabels.workflow || '工作流'}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {tableLabels.reason || '扣费原因'}
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {tableLabels.amount || '消耗积分'}
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {tableLabels.balanceAfter || '扣费后余额'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {events.map((event) => (
                    <tr key={event.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-800/40 transition">
                      <td className="px-4 py-3 text-gray-900 dark:text-white">
                        <div className="font-medium">{formatDateTime(event.createdAt)}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-900 dark:text-white">
                        <div className="font-medium">
                          {event.workflowName || event.workflowId || tableLabels.workflowFallback || '未命名工作流'}
                        </div>
                        {event.workflowId && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            ID: {event.workflowId}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-200">
                        {event.reason || event.description || tableLabels.reasonFallback || '—'}
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold ${getAmountColorClass(event)}`}>
                        {formatEventAmount(event)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-900 dark:text-white">
                        {formatNumber(event.balanceAfter)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {pageLabel}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handlePrev}
              disabled={!canGoPrev || loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowLeft className="w-4 h-4" />
              {paginationLabels.previous || '上一页'}
            </button>
            <button
              type="button"
              onClick={handleNext}
              disabled={!canGoNext || loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {paginationLabels.next || '下一页'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
