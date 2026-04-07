import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle } from 'lucide-react';

const SHORT_COOLDOWN_SECONDS = 60;
const RATE_LIMIT_COOLDOWN_SECONDS = 60 * 60;
const COOLDOWN_STORAGE_KEY = 'login_otp_cooldown_expires';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [loginMethod, setLoginMethod] = useState<'magic_link' | 'password'>('magic_link');
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    const storedExpiry = localStorage.getItem(COOLDOWN_STORAGE_KEY);
    if (storedExpiry) {
      const remaining = Math.max(0, Math.ceil((Number(storedExpiry) - Date.now()) / 1000));
      if (remaining > 0) {
        setCooldown(remaining);
      } else {
        localStorage.removeItem(COOLDOWN_STORAGE_KEY);
      }
    }
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          localStorage.removeItem(COOLDOWN_STORAGE_KEY);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown > 0]);

  const startCooldown = (seconds = SHORT_COOLDOWN_SECONDS) => {
    const clamped = Math.max(0, Math.round(seconds));
    if (!clamped) {
      setCooldown(0);
      localStorage.removeItem(COOLDOWN_STORAGE_KEY);
      return;
    }
    setCooldown((prev) => {
      const next = Math.max(prev, clamped);
      localStorage.setItem(COOLDOWN_STORAGE_KEY, String(Date.now() + next * 1000));
      return next;
    });
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || cooldown > 0) return;
    setLoading(true);
    setError('');
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });
      if (err) {
        const isRateLimited =
          (err as any)?.status === 429 ||
          err.message.toLowerCase().includes('rate limit');
        if (isRateLimited) {
          startCooldown(RATE_LIMIT_COOLDOWN_SECONDS);
          setError('发送过于频繁，请等待约 1 小时后再试');
        } else {
          setError(err.message);
        }
        return;
      }
      startCooldown(SHORT_COOLDOWN_SECONDS);
      setOtpSent(true);
    } catch {
      setError('发送失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? '验证码错误或已过期');
        return;
      }
      if (data?.session?.access_token) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      }
      navigate('/', { replace: true });
    } catch {
      setError('验证失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) {
        setError(err.message === 'Invalid login credentials' ? '邮箱或密码错误' : err.message);
        return;
      }
      navigate('/', { replace: true });
    } catch {
      setError('登录失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const getCooldownLabel = () =>
    cooldown > 0 ? `${cooldown}s 后可重新发送` : '发送验证码';

  return (
    <div className="flex min-h-screen w-full bg-white font-sans">
      {/* Left Panel */}
      <div className="w-full lg:w-3/5 flex flex-col justify-center p-8 md:p-12 lg:p-24 relative z-10">
        {/* Logo */}
        <div className="absolute top-6 left-6 lg:top-8 lg:left-8">
          <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center">
            <span className="text-white font-bold text-xs leading-tight text-center">数字人</span>
          </div>
        </div>

        {/* Form */}
        <div className="w-full max-w-[400px] mx-auto">
          <AnimatePresence mode="wait">
            {otpSent ? (
              <motion.div
                key="otp-verify"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <h1 className="text-3xl font-medium text-black mb-2 text-center lg:text-left">
                  输入验证码
                </h1>
                <p className="text-gray-500 mb-10 text-center lg:text-left">
                  验证码已发送至{' '}
                  <span className="font-medium text-black">{email}</span>
                </p>

                <form onSubmit={handleVerifyOtp} className="space-y-6">
                  <div className="space-y-2">
                    <label htmlFor="otp" className="block text-sm font-medium text-gray-700 ml-1">
                      验证码
                    </label>
                    <input
                      id="otp"
                      type="text"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      required
                      autoFocus
                      maxLength={6}
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all duration-200 tracking-widest text-lg"
                      placeholder="123456"
                    />
                  </div>

                  {error && <p className="text-red-500 text-sm">{error}</p>}

                  <div className="space-y-3 pt-4">
                    <button
                      type="submit"
                      disabled={loading || otp.length < 6}
                      className="w-full flex items-center justify-center py-3.5 px-4 bg-black text-white rounded-full text-sm font-medium hover:bg-gray-800 focus:outline-none transition-all duration-200 disabled:opacity-40"
                    >
                      {loading ? '验证中...' : '确认登录'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setOtpSent(false); setOtp(''); setError(''); }}
                      className="w-full flex justify-center items-center py-3.5 px-4 border border-gray-200 rounded-full text-sm font-medium text-black bg-white hover:bg-gray-50 focus:outline-none transition-all duration-200"
                    >
                      返回
                    </button>
                  </div>
                </form>
              </motion.div>
            ) : (
              <motion.div
                key="form"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <h1 className="text-3xl font-medium text-black mb-10 text-center lg:text-left">
                  {loginMethod === 'magic_link' ? '邮箱验证码登录' : '密码登录'}
                </h1>

                <form
                  onSubmit={loginMethod === 'magic_link' ? handleSendOtp : handlePasswordLogin}
                  className="space-y-6"
                >
                  <div className="space-y-2">
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 ml-1">
                      邮箱
                    </label>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all duration-200"
                      placeholder=""
                    />
                  </div>

                  {loginMethod === 'password' && (
                    <div className="space-y-2">
                      <label htmlFor="password" className="block text-sm font-medium text-gray-700 ml-1">
                        密码
                      </label>
                      <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all duration-200"
                      />
                    </div>
                  )}

                  {error && <p className="text-red-500 text-sm">{error}</p>}

                  <div className="space-y-3 pt-4">
                    <button
                      type="submit"
                      disabled={loading || (loginMethod === 'magic_link' && cooldown > 0)}
                      className="w-full flex items-center justify-center py-3.5 px-4 bg-black text-white rounded-full text-sm font-medium hover:bg-gray-800 focus:outline-none transition-all duration-200 disabled:opacity-40"
                    >
                      {loading
                        ? (loginMethod === 'magic_link' ? '发送中...' : '登录中...')
                        : loginMethod === 'magic_link'
                          ? getCooldownLabel()
                          : '登录'}
                    </button>
                  </div>
                </form>

                <div className="mt-8 flex items-center justify-end text-sm">
                  <button
                    onClick={() => { setLoginMethod(loginMethod === 'magic_link' ? 'password' : 'magic_link'); setError(''); }}
                    className="text-gray-400 hover:text-black transition-colors"
                  >
                    {loginMethod === 'magic_link' ? '密码登录' : '验证码登录'}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="mt-8 w-full max-w-[400px] mx-auto">
          <div className="flex items-center gap-3 text-xs text-gray-500 text-left">
            <button
              type="button"
              className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-gray-300 bg-black text-white shadow-sm"
            >
              <CheckCircle className="h-3 w-3" strokeWidth={3} />
            </button>
            <p className="flex-1 leading-relaxed">继续即表示您同意我们的服务条款和隐私政策</p>
          </div>
        </div>
      </div>

      {/* Right Panel - Video (desktop only) */}
      <div className="hidden lg:flex lg:w-2/5 items-center justify-center relative overflow-hidden bg-black">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-800 to-black" />
        <div className="relative z-10 text-center text-white px-12">
          <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <span className="text-white font-bold text-lg">数字人</span>
          </div>
          <h2 className="text-2xl font-semibold mb-3">AI 数字人创作平台</h2>
          <p className="text-gray-400 text-sm leading-relaxed">一键生成专属数字人视频，释放创作潜能</p>
        </div>
      </div>
    </div>
  );
}
