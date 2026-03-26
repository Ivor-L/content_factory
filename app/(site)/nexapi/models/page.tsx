'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { SiteHeader } from '../../components/SiteHeader';
import { SiteFooter } from '../../components/SiteFooter';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import { useTenantPath } from '@/hooks/useTenant';
import { Filter, ArrowLeft, Copy, Info } from 'lucide-react';

interface ModelInfo {
  modelId: string;
  displayName: string;
  provider: string;
  type: string;
  baseCostCnyPer1K: number;
  sellPriceCnyPer1K: number;
  minIncrement: number;
  routes: string[];
  capabilities: string[];
  description?: string | null;
  docsLink?: string | null;
  status: string;
  updatedAt: string;
}

export default function NexApiModelsPage() {
  const [lang, setLang] = useState<'en' | 'zh'>('en');
  const [mounted, setMounted] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [search, setSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const loginPath = useTenantPath('/login');
  const overviewPath = useTenantPath('/nexapi');
  const consolePath = useTenantPath('/nexapi/console');

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
    const { data: listener } = supabase.auth.onAuthStateChange((_evt, session) => {
      setAuthToken(session?.access_token ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const authedFetch = useCallback(
    async (url: string) => {
      if (!authToken) throw new Error('NO_SESSION');
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${authToken}` },
        cache: 'no-store',
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'REQUEST_FAILED');
      }
      return res.json();
    },
    [authToken]
  );

  useEffect(() => {
    if (!authToken) return;
    const loadModels = async () => {
      try {
        const res = await authedFetch('/api/nexapi/models');
        setModels(res.models ?? []);
      } catch (error) {
        console.error(error);
        toast.error('Failed to load models');
      }
    };
    void loadModels();
  }, [authToken, authedFetch]);

  const filteredModels = useMemo(() => {
    return models.filter((model) => {
      const matchesSearch = [model.modelId, model.displayName, model.provider, model.type]
        .join(' ')
        .toLowerCase()
        .includes(search.toLowerCase());
      const matchesProvider = providerFilter === 'all' || model.provider === providerFilter;
      const matchesType = typeFilter === 'all' || model.type === typeFilter;
      return matchesSearch && matchesProvider && matchesType;
    });
  }, [models, search, providerFilter, typeFilter]);

  const providerOptions = useMemo(() => ['all', ...new Set(models.map((m) => m.provider))], [models]);
  const typeOptions = useMemo(() => ['all', ...new Set(models.map((m) => m.type))], [models]);

  const notAuthed = !checkingSession && !authToken;

  const renderPriceBadge = (model: ModelInfo) => {
    const official = Number(model.baseCostCnyPer1K);
    const nexapi = Number(model.sellPriceCnyPer1K);
    if (!official || !nexapi || official <= 0) {
      return <span className="text-sm text-[#4b4f5f]">Pricing synced with official provider.</span>;
    }
    const diff = official - nexapi;
    const hasDiscount = diff > 0.005;
    const percent = hasDiscount ? Math.round((diff / official) * 100) : 0;
    return (
      <span
        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
          hasDiscount ? 'bg-emerald-100 text-emerald-800' : 'bg-[#101522]/5 text-[#4b4f5f]'
        }`}
      >
        {hasDiscount ? `↓ ${percent}% vs official` : 'Matches official rate'}
      </span>
    );
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-[#f4f3ef] text-[#101522]">
      <SiteHeader lang={lang} setLang={setLang} />
      <main className="pt-28 pb-20 px-6">
        <div className="mx-auto max-w-5xl space-y-10">
          <div className="flex flex-col gap-4 text-sm text-[#4b4f5f]">
            <Link href={overviewPath} className="inline-flex items-center gap-2 text-[#4b4f5f] hover:text-[#101522]">
              <ArrowLeft size={16} /> NexAPI
            </Link>
            <h1 className="text-3xl font-semibold text-[#101522]">Model Plaza</h1>
            <p className="text-[#4b4f5f]">Full catalog of routed models, pricing, and capabilities.</p>
            <p className="text-sm text-[#7a7f8f]">
              Every card lists the official provider rate next to NexAPI pricing so you can benchmark instantly.
            </p>
          </div>

          {notAuthed && (
            <div className="rounded-[32px] border border-black/5 bg-white/95 p-10 text-center shadow-[0_35px_120px_-60px_rgba(15,17,23,0.4)]">
              <p className="text-lg font-semibold text-[#101522]">Sign in to explore models</p>
              <p className="mt-2 text-[#4b4f5f]">Use your NexTide account to view pricing and routes.</p>
              <Link
                href={loginPath}
                className="mt-6 inline-flex items-center rounded-full bg-[#101522] px-6 py-3 text-sm font-semibold text-[#f8f7f3]"
              >
                Go to Login
              </Link>
            </div>
          )}

          {!notAuthed && (
            <div className="space-y-8">
              <div className="rounded-[32px] border border-black/5 bg-white/95 p-6 shadow-[0_25px_80px_-55px_rgba(17,19,32,0.35)]">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center rounded-full border border-black/10 px-4 py-2 text-[#4b4f5f]">
                    <Filter size={14} className="mr-2" /> Filters
                  </div>
                  <input
                    className="flex-1 min-w-[200px] rounded-full border border-black/10 bg-white/70 px-4 py-2 text-sm text-[#101522] placeholder-[#7a7f8f] focus:outline-none"
                    placeholder="Search model or provider"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  <select
                    className="rounded-full border border-black/10 bg-white/80 px-4 py-2 text-sm text-[#101522]"
                    value={providerFilter}
                    onChange={(event) => setProviderFilter(event.target.value)}
                  >
                    {providerOptions.map((option) => (
                      <option key={option} value={option} className="bg-white text-[#101522]">
                        {option === 'all' ? 'All providers' : option}
                      </option>
                    ))}
                  </select>
                  <select
                    className="rounded-full border border-black/10 bg-white/80 px-4 py-2 text-sm text-[#101522]"
                    value={typeFilter}
                    onChange={(event) => setTypeFilter(event.target.value)}
                  >
                    {typeOptions.map((option) => (
                      <option key={option} value={option} className="bg-white text-[#101522]">
                        {option === 'all' ? 'All types' : option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-4">
                {filteredModels.map((model) => (
                  <div key={model.modelId} className="rounded-[36px] border border-black/5 bg-white/95 p-6 shadow-[0_30px_100px_-65px_rgba(19,23,46,0.45)]">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <p className="text-sm uppercase tracking-[0.3em] text-[#7a7f8f]">{model.provider}</p>
                        <h3 className="text-2xl font-semibold text-[#101522]">{model.displayName}</h3>
                        <p className="text-sm text-[#7a7f8f]">{model.modelId}</p>
                      </div>
                      <div className="rounded-2xl border border-black/5 px-4 py-2 text-right text-sm text-[#4b4f5f] space-y-1">
                        <div>
                          <p className="text-xs uppercase tracking-[0.25em] text-[#7a7f8f]">Official</p>
                          <p className="text-base font-semibold text-[#101522]">¥{model.baseCostCnyPer1K.toFixed(3)} / 1K</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.25em] text-[#7a7f8f]">NexAPI</p>
                          <p className="text-lg font-semibold text-[#101522]">¥{model.sellPriceCnyPer1K.toFixed(3)} / 1K</p>
                        </div>
                        {renderPriceBadge(model)}
                      </div>
                    </div>
                    <p className="mt-4 text-sm text-[#4b4f5f]">{model.description || '—'}</p>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-[#101522]">
                      {model.capabilities.map((cap) => (
                        <span key={cap} className="rounded-full border border-black/10 px-3 py-1 bg-[#f4f3ef]">
                          {cap}
                        </span>
                      ))}
                      <span className="rounded-full border border-black/10 px-3 py-1 bg-[#f4f3ef]">{model.type}</span>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl border border-black/5 p-4 text-sm">
                        <p className="text-xs text-[#7a7f8f]">Routes</p>
                        <div className="mt-2 space-y-2">
                          {model.routes.map((route) => (
                            <div key={route} className="flex items-center justify-between gap-2">
                              <span className="truncate text-[#4b4f5f]">{route}</span>
                              <button
                                type="button"
                                className="text-xs text-[#2d63f1]"
                                onClick={() => navigator.clipboard.writeText(route).then(() => toast.success('Copied route'))}
                              >
                                <Copy size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-black/5 p-4 text-sm">
                        <p className="text-xs text-[#7a7f8f]">Docs & usage</p>
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-[#4b4f5f]">
                          <Link
                            href={consolePath}
                            className="inline-flex items-center gap-2 rounded-full border border-black/10 px-3 py-1 text-xs font-semibold text-[#101522]"
                          >
                            Manage keys
                          </Link>
                          {model.docsLink && (
                            <a
                              href={model.docsLink}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 rounded-full border border-black/10 px-3 py-1 text-xs font-semibold text-[#101522]"
                            >
                              <Info size={12} /> Docs
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {filteredModels.length === 0 && <p className="text-[#7a7f8f]">No models match the filter.</p>}
              </div>
            </div>
          )}
        </div>
      </main>
      <SiteFooter lang={lang} />
    </div>
  );
}
