'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import Image from 'next/image';
import Link from 'next/link';
import { TenantLogo } from '@/components/TenantLogo';
import { useLanguage } from '@/contexts/LanguageContext';
import { Globe, CheckCircle, ArrowRight, Sun, Moon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTenant } from '@/hooks/useTenant';
import { syncServerSession } from '@/lib/clientSessionSync';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

const SHORT_COOLDOWN_SECONDS = 60;
const RATE_LIMIT_COOLDOWN_SECONDS = 60 * 60; // 1 hour default limit on Supabase shared SMTP
const COOLDOWN_STORAGE_KEY = 'login_otp_cooldown_expires';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [loginMethod, setLoginMethod] = useState<'magic_link' | 'password'>('magic_link');
  const [otpSent, setOtpSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const router = useRouter();
  const { t, language, setLanguage } = useLanguage();
  const { basePath, tenant, tenantSlug } = useTenant();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const tenantDashboardPath = `${basePath || ''}/dashboard`;
  const tenantHomePath = basePath || '/';
  const brandName = tenant?.name || 'NexTide';
  const termsText = (t.auth?.termsPrivacy || "By continuing you agree to {{brand}}'s Terms of Service and Privacy Policy.").replace('{{brand}}', brandName);

  useEffect(() => {
    setMounted(true);
    if (typeof window === 'undefined') return;
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

  const hasCooldown = cooldown > 0;

  useEffect(() => {
    if (!hasCooldown) return;
    const timer = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (typeof window !== 'undefined') {
            localStorage.removeItem(COOLDOWN_STORAGE_KEY);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [hasCooldown]);

  const startCooldown = (seconds = SHORT_COOLDOWN_SECONDS) => {
    const clampedSeconds = Math.max(0, Math.round(seconds));
    if (!clampedSeconds) {
      setCooldown(0);
      if (typeof window !== 'undefined') {
        localStorage.removeItem(COOLDOWN_STORAGE_KEY);
      }
      return;
    }
    setCooldown((prev) => {
      const next = Math.max(prev, clampedSeconds);
      if (typeof window !== 'undefined') {
        localStorage.setItem(
          COOLDOWN_STORAGE_KEY,
          String(Date.now() + next * 1000)
        );
      }
      return next;
    });
  };

  const triggerProvisionCredits = async (
    accessToken: string | null | undefined,
    method: 'OTP' | 'password'
  ) => {
    if (!accessToken) return;
    try {
      const provisionRes = await fetch('/api/auth/provision-credits', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        credentials: 'same-origin',
        cache: 'no-store',
        keepalive: true,
      });
      if (!provisionRes.ok) {
        console.warn(`[auth] Failed to provision credits after ${method} login`, {
          status: provisionRes.status,
        });
      }
    } catch (error) {
      console.warn(`[auth] Failed to provision credits after ${method} login`, error);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
        toast.error('Please enter your email');
        return;
    }
    if (cooldown > 0) {
        return;
    }
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
        // Removed emailRedirectTo to request an OTP code instead of a magic link
      });

      if (error) throw error;

      setOtpSent(true);
      startCooldown(SHORT_COOLDOWN_SECONDS);
      toast.success(t.auth?.otpSent || 'Verification code sent!');
    } catch (error: any) {
      const message = error?.message || 'Failed to send verification code';
      const isRateLimited =
        error?.status === 429 ||
        (typeof message === 'string' && message.toLowerCase().includes('rate limit'));

      if (isRateLimited) {
        startCooldown(RATE_LIMIT_COOLDOWN_SECONDS);
      }

      const authCopy = t.auth as Record<string, string | undefined> | undefined;
      const rateLimitMessage =
        authCopy?.otpRateLimited ||
        authCopy?.rateLimited ||
        'Too many requests. Please wait up to 1 hour before trying again.';
      toast.error(isRateLimited ? rateLimitMessage : message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp) {
        toast.error('Please enter the verification code');
        return;
    }
    setLoading(true);

    try {
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message = payload?.error || 'Invalid verification code';
        throw new Error(message);
      }

      const payload = await response.json();
      const session = payload?.session;

      if (session?.access_token) {
        const { data, error } = await supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        });

        if (error) {
          throw error;
        }

        // verify-otp route already sets sb-access-token cookie on server.
        // Skip an extra blocking /api/auth/session round-trip here.
        void triggerProvisionCredits(data.session?.access_token ?? session.access_token, 'OTP');
      }

      localStorage.setItem('login_timestamp', Date.now().toString());
      toast.success('Login successful');
      router.replace(tenantDashboardPath);
      router.refresh();
    } catch (error: any) {
      toast.error(error.message || 'Invalid verification code');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      void triggerProvisionCredits(data.session?.access_token, 'password');
      try {
        await syncServerSession(data.session?.access_token ?? null);
      } catch (syncError) {
        console.warn('[auth] Failed to sync server session after password login', syncError);
      }
      localStorage.setItem('login_timestamp', Date.now().toString());
      toast.success('Login successful');
      router.replace(tenantDashboardPath);
      router.refresh();
    } catch (error: any) {
      toast.error(error.message || 'Failed to login');
    } finally {
      setLoading(false);
    }
  };

  const toggleLanguage = () => {
    if (language === 'en') setLanguage('zh');
    else if (language === 'zh') setLanguage('zh-TW');
    else setLanguage('en');
  };

  const getLanguageLabel = () => {
    if (language === 'en') return 'English';
    if (language === 'zh') return '简体中文';
    return '繁體中文';
  };

  const isDarkMode = resolvedTheme === 'dark';
  const toggleThemeMode = () => {
    setTheme(isDarkMode ? 'light' : 'dark');
  };

  const getCooldownLabel = () => {
    const template = (t.auth as Record<string, string | undefined> | undefined)?.resendIn;
    return template ? template.replace('{seconds}', String(cooldown)) : `Resend in ${cooldown}s`;
  };

  const isNexTideTenant = tenantSlug === 'nextide' || tenant?.name?.toLowerCase() === 'nextide';
  const isJubaoPenTenant = tenantSlug === 'jubaopen' || tenant?.name?.includes('聚保盆');
  const loginLogoWrapperClass = cn(
    "mb-5 flex justify-center lg:mb-6 lg:justify-start"
  );
  const loginLogoScaleClass = cn(
    "origin-center lg:origin-left",
    isNexTideTenant ? "scale-[0.28]" : isJubaoPenTenant ? "scale-[0.25]" : "scale-50"
  );
  const loginLogoSize: 'sm' | 'md' | 'lg' = isNexTideTenant ? 'md' : 'sm';
  const loginContentFrameClass = "mx-auto w-full max-w-[400px] lg:-translate-x-8 lg:-translate-y-6 xl:-translate-x-12 xl:-translate-y-8";

  if (!mounted) return null;

  return (
    <div className="flex h-dvh max-h-dvh w-full overflow-hidden bg-white font-sans selection:bg-[var(--tenant-primary)] selection:text-[var(--tenant-primary-foreground)] dark:bg-black">
      {/* Left Panel - Content */}
      <div className="relative z-10 flex h-full w-full flex-col justify-center overflow-hidden px-6 pb-6 pt-20 text-black dark:text-white sm:px-8 sm:pb-8 lg:w-3/5 lg:px-16 lg:py-8 xl:px-24">
        {/* Main Content */}
        <div className={loginContentFrameClass}>
            {/* Logo */}
            <div className={loginLogoWrapperClass}>
                <Link
                  href={tenantHomePath}
                  className="flex items-center gap-3"
                >
                    <TenantLogo
                      showName={false}
                      size={loginLogoSize}
                      className={loginLogoScaleClass}
                      forceMonoOnDark
                    />
                </Link>
            </div>

            <AnimatePresence mode="wait">
                {otpSent ? (
                    <motion.div 
                        key="otp-verify"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                    >
                        <h1 className="mb-2 text-center text-2xl font-medium text-black dark:text-white sm:text-3xl lg:text-left">
                            {t.auth?.enterCode || 'Enter verification code'}
                        </h1>
                        <p className="mb-6 text-center text-sm text-gray-500 dark:text-gray-300 sm:mb-8 sm:text-base lg:text-left">
                            {t.auth?.sentTo || 'We sent a code to'} <span className="font-medium text-black dark:text-white">{email}</span>
                        </p>

                        <form onSubmit={handleVerifyOtp} className="space-y-5 sm:space-y-6">
                            <div className="space-y-2">
                                <label htmlFor="otp" className="block text-sm font-medium text-gray-700 dark:text-gray-200 ml-1">
                                    {t.auth?.codeLabel || 'Verification Code'}
                                </label>
                                <input
                                    id="otp"
                                    type="text"
                                    value={otp}
                                    onChange={(e) => setOtp(e.target.value)}
                                    required
                                    autoFocus
                                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-400/40 focus:border-transparent transition-all duration-200 tracking-widest text-lg"
                                    placeholder="123456"
                                />
                            </div>

                            <div className="space-y-3 pt-2 sm:pt-4">
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="btn-openclaw w-full justify-center py-3.5 px-4 text-sm"
                                >
                                    {loading 
                                        ? (t.auth?.verifying || 'Verifying...') 
                                        : (t.auth?.verify || 'Verify & Sign in')
                                    }
                                </button>
                                
                                <button
                                    type="button"
                                    onClick={() => setOtpSent(false)}
                                    className="w-full flex justify-center items-center py-3.5 px-4 border border-gray-200 rounded-full text-sm font-medium text-black bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-300 transition-all duration-200"
                                >
                                    {t.auth?.back || 'Back'}
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
                        <h1 className="mb-6 text-center text-2xl font-medium text-black dark:text-white sm:mb-8 sm:text-3xl lg:text-left">
                            {loginMethod === 'magic_link' 
                                ? (t.auth?.signInTitle || 'Sign in with your email')
                                : (t.auth?.signInWithPassword || 'Sign in with password')
                            }
                        </h1>

                        <form onSubmit={loginMethod === 'magic_link' ? handleSendOtp : handlePasswordLogin} className="space-y-5 sm:space-y-6">
                            <div className="space-y-2">
                                <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-200 ml-1">
                                    {t.auth?.emailLabel || 'Email'}
                                </label>
                                <input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-400/40 focus:border-transparent transition-all duration-200"
                                    placeholder=""
                                />
                            </div>

                            {loginMethod === 'password' && (
                                <div className="space-y-2">
                                    <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-200 ml-1">
                                        {t.auth?.passwordLabel || 'Password'}
                                    </label>
                                    <input
                                        id="password"
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-400/40 focus:border-transparent transition-all duration-200"
                                    />
                                </div>
                            )}

                            <div className="space-y-3 pt-2 sm:pt-4">
                                <button
                                    type="submit"
                                    disabled={loading || (loginMethod === 'magic_link' && cooldown > 0)}
                                    className="btn-openclaw w-full justify-center py-3.5 px-4 text-sm"
                                >
                                    {loading
                                        ? (t.auth?.sending || 'Sending...')
                                        : loginMethod === 'magic_link'
                                          ? cooldown > 0
                                            ? getCooldownLabel()
                                            : (t.auth?.sendCode || 'Send Verification Code')
                                          : (t.auth?.signIn || 'Sign in')
                                    }
                                </button>
                                
                                <button
                                    type="button"
                                    onClick={() => router.push('/')}
                                    className="w-full flex justify-center items-center py-3.5 px-4 border border-gray-200 rounded-full text-sm font-medium text-black bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-300 transition-all duration-200"
                                >
                                    {t.auth?.back || 'Back'}
                                </button>
                            </div>
                        </form>

                        <div className="mt-5 flex items-center justify-between text-sm sm:mt-6">
                            <div className="flex items-center gap-1 text-gray-500 dark:text-gray-300">
                            </div>

                            <button
                                onClick={() => setLoginMethod(loginMethod === 'magic_link' ? 'password' : 'magic_link')}
                                className="text-gray-400 dark:text-gray-200 hover:text-black dark:hover:text-white transition-colors"
                            >
                                {loginMethod === 'magic_link' ? (t.auth?.passwordMode || 'Password') : (t.auth?.emailCodeMode || 'Email Code')}
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>

        {/* Footer */}
        <div className={cn(loginContentFrameClass, "mt-5 sm:mt-6")}>
          <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-300 text-left">
              <button
                  type="button"
                  aria-pressed="true"
                  className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-gray-300 bg-black text-white shadow-sm dark:bg-white dark:text-black"
              >
                  <CheckCircle className="h-3 w-3" strokeWidth={3} />
              </button>
              <p className="flex-1 leading-relaxed">{termsText}</p>
          </div>
        </div>
      </div>

      {/* Right Panel - Visual */}
      <div className="relative hidden h-full items-center justify-center overflow-hidden bg-black lg:flex lg:w-2/5">
        <Image
          src="/login-hero-entryway.avif"
          alt="Creative entryway organization inspiration"
          fill
          priority
          sizes="40vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-black/50 via-black/20 to-black/60" />

        {/* Language Switcher */}
        <div className="absolute bottom-8 right-8 z-20 flex gap-2">
            <button
                onClick={toggleLanguage}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white text-sm font-medium transition-all duration-200 border border-white/10"
            >
                <Globe size={16} />
                {getLanguageLabel()}
            </button>
            <button
                onClick={toggleThemeMode}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white text-sm font-medium transition-all duration-200 border border-white/10"
                aria-label={isDarkMode ? '切换到明亮模式' : '切换到黑暗模式'}
            >
                {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
                {isDarkMode ? '明亮模式' : '黑暗模式'}
            </button>
        </div>
      </div>

      {/* Mobile Language Switcher */}
      <div className="absolute right-6 top-6 z-20 flex gap-2 sm:right-8 sm:top-8 lg:hidden">
          <button
              onClick={toggleLanguage}
              className="p-2 rounded-full border border-gray-200 text-gray-500 hover:text-black transition-colors bg-white/80"
          >
              <Globe size={20} />
          </button>
          <button
              onClick={toggleThemeMode}
              className="p-2 rounded-full border border-gray-200 text-gray-500 hover:text-black transition-colors bg-white/80"
              aria-label={isDarkMode ? '切换到明亮模式' : '切换到黑暗模式'}
          >
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
      </div>
    </div>
  );
}
