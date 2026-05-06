'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function AgentLoginPage() {
  const [userCode, setUserCode] = useState('');
  const [status, setStatus] = useState<string>('');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);

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
          setStatus('当前 localhost 页面没有检测到登录态。请先在本地登录 NexTide Web，或在下方填写 NexTide API Key 后再授权。');
        } else {
          setStatus(data?.message || data?.error || '授权失败，请确认已登录 NexTide Web 或填写正确的 NexTide API Key。');
        }
        return;
      }
      setStatus(action === 'approve' ? '授权成功。你可以回到终端继续使用 nextide。' : '已拒绝本次设备登录。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '请求失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl">
        <div className="mb-6">
          <p className="text-sm text-cyan-300">NexTide Agent</p>
          <h1 className="mt-2 text-2xl font-semibold">授权 CLI 登录</h1>
          <p className="mt-3 text-sm leading-6 text-neutral-300">
            在终端执行 <code className="rounded bg-black/30 px-1 py-0.5">nextide auth login</code> 后，把显示的授权码填到这里。授权后 CLI 会获得当前账号的 NexTide API Key。
          </p>
        </div>

        <label className="block text-sm text-neutral-300">授权码</label>
        <input
          value={userCode}
          onChange={(event) => setUserCode(event.target.value.toUpperCase())}
          placeholder="123-456"
          className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-lg tracking-widest outline-none focus:border-cyan-400"
        />

        <label className="mt-4 block text-sm text-neutral-300">NexTide API Key，未检测到本地登录态时填写</label>
        <input
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder="可选，粘贴当前账号 NexTide API Key"
          className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-cyan-400"
        />

        <div className="mt-6 flex gap-3">
          <button
            disabled={loading || !userCode.trim()}
            onClick={() => submit('approve')}
            className="flex-1 rounded-xl bg-cyan-400 px-4 py-3 font-medium text-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            授权
          </button>
          <button
            disabled={loading || !userCode.trim()}
            onClick={() => submit('deny')}
            className="rounded-xl border border-white/10 px-4 py-3 text-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            拒绝
          </button>
        </div>

        {status ? <p className="mt-5 rounded-xl bg-black/30 p-3 text-sm text-neutral-100">{status}</p> : null}

        <p className="mt-6 text-xs leading-5 text-neutral-500">
          如果提示未登录，请先在同一个浏览器登录 NexTide Web，然后重新打开本页面。
        </p>
      </div>
    </main>
  );
}
