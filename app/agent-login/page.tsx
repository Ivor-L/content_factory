'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function AgentLoginPage() {
  const [userCode, setUserCode] = useState('');
  const [status, setStatus] = useState<string>('');
  const [apiKey, setApiKey] = useState('');
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<'approved' | 'denied' | null>(null);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('user_code') || '';
    setUserCode(code.toUpperCase());
  }, []);

  async function submit(action: 'approve' | 'deny') {
    setLoading(true);
    setStatus('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      } else if (apiKey.trim()) {
        headers['x-user-api-key'] = apiKey.trim();
      }
      const res = await fetch('/api/agent/auth/device/approve', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ user_code: userCode, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401 && !session?.access_token && !apiKey.trim()) {
          setStatus('未检测到当前浏览器登录态。请先登录 NexTide Web，或使用“手动绑定 API Key”。');
        } else {
          setStatus(data?.message || data?.error || '授权失败，请确认已登录 NexTide Web 或填写正确的 NexTide API Key。');
        }
        return;
      }
      setShowApiKeyModal(false);
      setDone(action === 'approve' ? 'approved' : 'denied');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '请求失败');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <main className="min-h-screen bg-[#f5f5f3] text-neutral-950 flex items-center justify-center px-6">
        <section className="w-full max-w-[440px] rounded-[32px] border border-neutral-200 bg-white p-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.08)]">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-neutral-950 text-white">
            {done === 'approved' ? '✓' : '×'}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {done === 'approved' ? '授权成功' : '已拒绝授权'}
          </h1>
          <p className="mt-3 text-sm leading-6 text-neutral-500">
            {done === 'approved'
              ? 'NexTide CLI 已获得当前账号的 NexTide API Key。你可以回到终端继续使用 nextide。'
              : '本次设备登录请求已被拒绝。你可以关闭此页面。'}
          </p>
          <div className="mt-8 rounded-2xl bg-neutral-100 px-4 py-3 text-xs text-neutral-500">
            你可以安全关闭这个页面
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f5f3] text-neutral-950 flex items-center justify-center px-6 py-10">
      <section className="w-full max-w-[460px] rounded-[34px] border border-neutral-200 bg-white p-8 shadow-[0_24px_80px_rgba(0,0,0,0.08)]">
        <div className="flex flex-col items-center text-center">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
            <Image src="/logo/NexTidelogo.png" alt="NexTide" width={44} height={44} className="h-11 w-11 object-contain" priority />
          </div>
          <p className="text-xs font-medium uppercase tracking-[0.28em] text-neutral-400">NexTide Agent</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">授权 CLI 登录</h1>
          <p className="mt-4 max-w-sm text-sm leading-6 text-neutral-500">
            确认终端中的授权码，授权后 CLI 会获得当前账号的 NexTide API Key，用于调用你的 NexTide 能力。
          </p>
        </div>

        <div className="mt-8 rounded-3xl border border-neutral-200 bg-neutral-50 p-4">
          <label className="block text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">Verification Code</label>
          <input
            value={userCode}
            onChange={(event) => setUserCode(event.target.value.toUpperCase())}
            placeholder="123-456"
            className="mt-3 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-4 text-center text-2xl font-semibold tracking-[0.22em] text-neutral-950 outline-none transition focus:border-neutral-950"
          />
        </div>

        <div className="mt-6 flex gap-3">
          <button
            disabled={loading || !userCode.trim()}
            onClick={() => submit('approve')}
            className="flex-1 rounded-2xl bg-neutral-950 px-5 py-4 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? '处理中...' : '授权'}
          </button>
          <button
            disabled={loading || !userCode.trim()}
            onClick={() => submit('deny')}
            className="rounded-2xl border border-neutral-200 bg-white px-5 py-4 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            拒绝
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowApiKeyModal(true)}
          className="mt-5 w-full text-center text-xs text-neutral-400 underline-offset-4 hover:text-neutral-700 hover:underline"
        >
          手动绑定 API Key
        </button>

        {status ? <p className="mt-5 rounded-2xl bg-neutral-100 p-3 text-sm leading-6 text-neutral-600">{status}</p> : null}

        <p className="mt-6 text-center text-xs leading-5 text-neutral-400">
          如果没有检测到登录态，请先登录 NexTide Web 后回到本页。
        </p>
      </section>

      {showApiKeyModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
          <div className="w-full max-w-md rounded-[28px] border border-neutral-200 bg-white p-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-neutral-950">手动绑定 API Key</h2>
                <p className="mt-2 text-sm leading-6 text-neutral-500">
                  仅在浏览器未检测到登录态时使用。请输入当前账号的 NexTide API Key。
                </p>
              </div>
              <button onClick={() => setShowApiKeyModal(false)} className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">×</button>
            </div>
            <input
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="粘贴 NexTide API Key"
              className="mt-5 w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none transition focus:border-neutral-950"
            />
            <div className="mt-5 flex gap-3">
              <button
                disabled={loading || !userCode.trim() || !apiKey.trim()}
                onClick={() => submit('approve')}
                className="flex-1 rounded-2xl bg-neutral-950 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                使用 API Key 授权
              </button>
              <button onClick={() => setShowApiKeyModal(false)} className="rounded-2xl border border-neutral-200 px-4 py-3 text-sm font-semibold text-neutral-700 hover:bg-neutral-100">
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
