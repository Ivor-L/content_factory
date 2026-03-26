'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Zap,
  RefreshCw,
  Key as KeyIcon,
  Trash2,
  CreditCard,
  Activity,
  ExternalLink
} from 'lucide-react';
import { SiteHeader } from '../../components/SiteHeader';
import { SiteFooter } from '../../components/SiteFooter';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import { useTenantPath } from '@/hooks/useTenant';

interface SummaryResponse {
  wallet: { balanceCredits: string; currency: string; updatedAt: string };
  routes: Array<{ id: string; label: string; baseUrl: string; healthy: boolean; latencyMs: number | null; error?: string }>;
}

interface ApiKeyRow {
  id: string;
  label: string | null;
  lastFour: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface UsageItem {
  id: string;
  modelId: string;
  route: string;
  promptTokens: number;
  completionTokens: number;
  chargedCredits: string;
  priceCny: number;
  createdAt: string;
}

interface RechargeOrder {
  id: string;
  amountCny: number;
  credits: string;
  status: string;
  payUrl?: string | null;
  createdAt: string;
}

export default function NexApiConsolePage() {
  const [lang, setLang] = useState<'en' | 'zh'>('en');
  const [mounted, setMounted] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [usage, setUsage] = useState<UsageItem[]>([]);
  const [orders, setOrders] = useState<RechargeOrder[]>([]);
  const [creatingKey, setCreatingKey] = useState(false);
  const [latestSecret, setLatestSecret] = useState<string | null>(null);
  const [keyLabel, setKeyLabel] = useState('');
  const [rechargeAmount, setRechargeAmount] = useState('100');
  const [rechargeLoading, setRechargeLoading] = useState(false);
  const loginPath = useTenantPath('/login');
  const overviewPath = useTenantPath('/nexapi');

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      const userLang = navigator.language.startsWith('zh') ? 'zh' : 'en';
      setLang(userLang);
    }
  }, []);

  useEffect(() => {
    const syncSession = async () => {
      setCheckingSession(true);
      const {
        data: { session }
      } = await supabase.auth.getSession();
      setAuthToken(session?.access_token ?? null);
      setCheckingSession(false);
    };

    void syncSession();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthToken(session?.access_token ?? null);
    });
    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const authedFetch = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!authToken) throw new Error('NO_SESSION');
      const headers = new Headers(init?.headers);
      headers.set('Authorization', `Bearer ${authToken}`);
      if (!headers.has('Content-Type') && init?.body && !(init.body instanceof FormData)) {
        headers.set('Content-Type', 'application/json');
      }
      const response = await fetch(input, { ...init, headers, cache: 'no-store' });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'REQUEST_FAILED');
      }
      return response.json();
    },
    [authToken]
  );

  const loadConsoleData = useCallback(async () => {
    if (!authToken) return;
    try {
      const [summaryRes, keysRes, usageRes, ordersRes] = await Promise.all([
        authedFetch('/api/nexapi/console/summary'),
        authedFetch('/api/nexapi/keys'),
        authedFetch('/api/nexapi/usage?limit=20'),
        authedFetch('/api/nexapi/recharge/orders'),
      ]);
      setSummary(summaryRes);
      setKeys(keysRes.keys ?? []);
      setUsage(usageRes.items ?? []);
      setOrders(ordersRes.orders ?? []);
    } catch (error) {
      console.error(error);
      toast.error('Failed to load console data');
    }
  }, [authToken, authedFetch]);

  useEffect(() => {
    if (authToken) {
      void loadConsoleData();
    }
  }, [authToken, loadConsoleData]);

  const handleCreateKey = async () => {
    try {
      setCreatingKey(true);
      const res = await authedFetch('/api/nexapi/keys', {
        method: 'POST',
        body: JSON.stringify({ label: keyLabel.trim() || undefined }),
      });
      setLatestSecret(res.key?.secret ?? null);
      setKeyLabel('');
      toast.success('API key created');
      void loadConsoleData();
    } catch (error: any) {
      toast.error(error?.message?.slice(0, 80) ?? 'Failed to create key');
    } finally {
      setCreatingKey(false);
    }
  };

  const handleRevokeKey = async (id: string) => {
    try {
      await authedFetch(`/api/nexapi/keys/${id}`, { method: 'DELETE' });
      toast.success('API key revoked');
      void loadConsoleData();
    } catch (error: any) {
      toast.error(error?.message?.slice(0, 80) ?? 'Failed to revoke key');
    }
  };

  const handleCreateRecharge = async () => {
    const amount = Number(rechargeAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    try {
      setRechargeLoading(true);
      const res = await authedFetch('/api/nexapi/recharge/orders', {
        method: 'POST',
        body: JSON.stringify({ amountCny: amount }),
      });
      if (res.order?.payUrl) {
        window.open(res.order.payUrl, '_blank');
      }
      toast.success('Recharge order created');
      void loadConsoleData();
    } catch (error: any) {
      toast.error(error?.message?.slice(0, 80) ?? 'Failed to create recharge order');
    } finally {
      setRechargeLoading(false);
    }
  };

  const balanceDisplay = useMemo(() => {
    if (!summary) return '—';
    const balance = Number(summary.wallet.balanceCredits);
    return `${(balance / 100).toLocaleString()} ¥`;
  }, [summary]);

  const notAuthed = !checkingSession && !authToken;

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-[#f4f3ef] text-[#101522]">
      <SiteHeader lang={lang} setLang={setLang} />
      <main className="pt-28 pb-20 px-6">
        <div className="mx-auto max-w-5xl space-y-12">
          <div className="flex flex-col gap-4 text-sm text-[#4b4f5f]">
            <Link href={overviewPath} className="inline-flex items-center gap-2 text-[#4b4f5f] hover:text-[#101522]">
              <ArrowLeft size={16} /> NexAPI
            </Link>
            <h1 className="text-3xl font-semibold text-[#101522]">API Console</h1>
            <p className="text-[#4b4f5f]">
              Manage keys, monitor credits, and recharge without touching the legacy dashboard.
            </p>
          </div>

          {notAuthed && (
            <div className="rounded-[32px] border border-black/5 bg-white/95 p-10 text-center shadow-[0_35px_120px_-60px_rgba(15,17,23,0.4)]">
              <p className="text-lg font-semibold text-[#101522]">Sign in to access NexAPI</p>
              <p className="mt-2 text-[#4b4f5f]">Use your NexTide account to view balances and manage keys.</p>
              <Link
                href={loginPath}
                className="mt-6 inline-flex items-center rounded-full bg-[#101522] px-6 py-3 text-sm font-semibold text-[#f8f7f3]"
              >
                Go to Login
              </Link>
            </div>
          )}

          {!notAuthed && (
            <div className="space-y-10">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded-[32px] border border-black/5 bg-white/95 p-6 shadow-[0_25px_80px_-55px_rgba(17,19,32,0.45)]">
                  <p className="text-xs uppercase tracking-[0.4em] text-[#7a7f8f]">Credits</p>
                  <h2 className="mt-4 text-4xl font-semibold">{balanceDisplay}</h2>
                  <p className="mt-2 text-sm text-[#4b4f5f]">
                    1 RMB = 100 credits. Recharge instantly via Alipay.
                  </p>
                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    <input
                      className="w-32 rounded-full border border-black/10 bg-white/70 px-4 py-2 text-sm text-[#101522] placeholder-[#7a7f8f] focus:outline-none"
                      value={rechargeAmount}
                      onChange={(event) => setRechargeAmount(event.target.value)}
                      placeholder="Amount (¥)"
                    />
                    <button
                      type="button"
                      onClick={handleCreateRecharge}
                      disabled={rechargeLoading}
                      className="inline-flex items-center gap-2 rounded-full bg-[#101522] px-5 py-2 text-sm font-semibold text-[#f8f7f3]"
                    >
                      <CreditCard size={16} />
                      {rechargeLoading ? 'Processing…' : 'Recharge via Alipay'}
                    </button>
                  </div>
                  <div className="mt-4 text-xs text-[#7a7f8f]">
                    Updated {summary ? new Date(summary.wallet.updatedAt).toLocaleString() : '—'}
                  </div>
                </div>
                <div className="rounded-[32px] border border-black/5 bg-white/90 p-6 shadow-[0_25px_80px_-55px_rgba(17,19,32,0.35)]">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#7a7f8f]">Routes</p>
                  <div className="mt-4 space-y-3">
                    {summary?.routes?.map((route) => (
                      <div key={route.id} className="flex items-center justify-between rounded-2xl border border-black/5 px-4 py-2 text-sm">
                        <div>
                          <p className="font-semibold text-[#101522]">{route.label}</p>
                          <p className="text-xs text-[#7a7f8f]">{route.baseUrl}</p>
                        </div>
                        <div className="text-right text-xs">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] ${route.healthy ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'}`}>
                            <Activity size={12} /> {route.healthy ? 'Healthy' : 'Down'}
                          </span>
                          <div className="mt-1 text-[#7a7f8f]">{route.latencyMs ? `${route.latencyMs} ms` : '—'}</div>
                        </div>
                      </div>
                    )) || '—'}
                  </div>
                </div>
              </div>

              <div className="rounded-[32px] border border-black/5 bg-white/95 p-6 shadow-[0_30px_95px_-65px_rgba(19,23,46,0.45)] space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-semibold text-[#101522]">API Keys</h3>
                    <p className="text-sm text-[#4b4f5f]">Rotate keys, label per agent, and revoke instantly.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <input
                      className="rounded-full border border-black/10 bg-white/70 px-4 py-2 text-sm text-[#101522] placeholder-[#7a7f8f] focus:outline-none"
                      placeholder="Label (optional)"
                      value={keyLabel}
                      onChange={(event) => setKeyLabel(event.target.value)}
                    />
                    <button
                      type="button"
                      onClick={handleCreateKey}
                      disabled={creatingKey}
                      className="inline-flex items-center gap-2 rounded-full bg-[#101522] px-4 py-2 text-sm font-semibold text-[#f8f7f3]"
                    >
                      <KeyIcon size={16} />
                      {creatingKey ? 'Creating…' : 'Create Key'}
                    </button>
                  </div>
                </div>
                {latestSecret && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-[#0f5132]">
                    <p className="font-semibold">New key</p>
                    <p className="break-all text-[#0f5132]/80">{latestSecret}</p>
                    <p className="text-xs text-[#0f5132]/70">Copy and store this value now. It will not be shown again.</p>
                  </div>
                )}
                <div className="overflow-x-auto text-sm">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="text-left text-[#7a7f8f]">
                        <th className="pb-2">Label</th>
                        <th className="pb-2">Key</th>
                        <th className="pb-2">Status</th>
                        <th className="pb-2">Created</th>
                        <th className="pb-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {keys.map((key) => (
                        <tr key={key.id} className="border-t border-black/5">
                          <td className="py-2">{key.label || '—'}</td>
                          <td className="py-2 font-mono text-sm text-[#4b4f5f]">…{key.lastFour}</td>
                          <td className="py-2">
                            <span className={`rounded-full px-3 py-1 text-xs ${key.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                              {key.status}
                            </span>
                          </td>
                          <td className="py-2 text-[#7a7f8f]">{new Date(key.createdAt).toLocaleString()}</td>
                          <td className="py-2 text-right">
                            <button
                              type="button"
                              onClick={() => handleRevokeKey(key.id)}
                              className="inline-flex items-center gap-1 rounded-full border border-black/10 px-3 py-1 text-xs text-[#4b4f5f] hover:text-[#101522]"
                            >
                              <Trash2 size={12} /> Revoke
                            </button>
                          </td>
                        </tr>
                      ))}
                      {keys.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-4 text-center text-[#7a7f8f]">
                            No keys yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded-[32px] border border-black/5 bg-white/95 p-6 shadow-[0_30px_90px_-70px_rgba(15,17,23,0.35)]">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-semibold text-[#101522]">Recent Usage</h3>
                    <button
                      type="button"
                      onClick={() => loadConsoleData()}
                      className="inline-flex items-center gap-2 rounded-full border border-black/10 px-3 py-1 text-xs text-[#4b4f5f]"
                    >
                      <RefreshCw size={12} /> Refresh
                    </button>
                  </div>
                  <div className="mt-4 space-y-3 text-sm text-[#4b4f5f]">
                    {usage.slice(0, 6).map((item) => (
                      <div key={item.id} className="rounded-2xl border border-black/5 p-4">
                        <div className="flex items-center justify-between text-xs text-[#7a7f8f]">
                          <span>{new Date(item.createdAt).toLocaleString()}</span>
                          <span>{item.route}</span>
                        </div>
                        <div className="mt-2 text-[#101522] font-semibold">{item.modelId}</div>
                        <div className="mt-1 text-xs text-[#7a7f8f]">
                          {item.promptTokens} → {item.completionTokens} tokens
                        </div>
                        <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-[#101522]/5 px-3 py-1 text-xs text-[#101522]">
                          <Zap size={12} /> -{item.chargedCredits} credits
                        </div>
                      </div>
                    ))}
                    {usage.length === 0 && <p className="text-[#7a7f8f]">No usage yet.</p>}
                  </div>
                </div>
                <div className="rounded-[32px] border border-black/5 bg-white/95 p-6 space-y-4 shadow-[0_30px_90px_-70px_rgba(15,17,23,0.35)]">
                  <h3 className="text-xl font-semibold text-[#101522]">Recharge Orders</h3>
                  <p className="text-sm text-[#4b4f5f]">
                    Use Alipay scan or PC payment to top up credits instantly.
                  </p>
                  <div className="max-h-64 overflow-y-auto text-sm text-[#4b4f5f]">
                    {orders.map((order) => (
                      <div key={order.id} className="border-t border-black/5 py-3">
                        <div className="flex justify-between text-xs text-[#7a7f8f]">
                          <span>{new Date(order.createdAt).toLocaleString()}</span>
                          <span>{order.status}</span>
                        </div>
                        <p className="mt-2 text-[#101522] font-semibold">¥{order.amountCny.toFixed(2)}</p>
                        {order.payUrl && order.status === 'pending' && (
                          <a
                            href={order.payUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-[#2d63f1]"
                          >
                            <ExternalLink size={12} /> Pay link
                          </a>
                        )}
                      </div>
                    ))}
                    {orders.length === 0 && <p className="text-[#7a7f8f]">No recharge history.</p>}
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>
      </main>
      <SiteFooter lang={lang} />
    </div>
  );
}
