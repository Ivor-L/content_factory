'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import Link from 'next/link';
import { TenantLogo } from '@/components/TenantLogo';
import { AtomXLogo } from '@/components/AtomXLogo';
import { useLanguage } from '@/contexts/LanguageContext';
import { Globe, CheckCircle, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTenant } from '@/hooks/useTenant';

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
  const { basePath, tenant } = useTenant();
  const [mounted, setMounted] = useState(false);
  const tenantDashboardPath = `${basePath || ''}/dashboard`;
  const tenantHomePath = basePath || '/';
  const brandName = tenant?.name || 'AtomX';
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
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: 'email',
      });

      if (error) throw error;

      localStorage.setItem('login_timestamp', Date.now().toString());
      toast.success('Login successful');
      router.push(tenantDashboardPath);
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
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      localStorage.setItem('login_timestamp', Date.now().toString());
      toast.success('Login successful');
      router.push(tenantDashboardPath);
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

  const getCooldownLabel = () => {
    const template = (t.auth as Record<string, string | undefined> | undefined)?.resendIn;
    return template ? template.replace('{seconds}', String(cooldown)) : `Resend in ${cooldown}s`;
  };

  if (!mounted) return null;

  return (
    <div className="flex min-h-screen w-full bg-white dark:bg-black font-sans selection:bg-[var(--tenant-primary)] selection:text-[var(--tenant-primary-foreground)]">
      {/* Left Panel - Content */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center p-8 md:p-12 lg:p-24 relative z-10">
        {/* Logo */}
        <div className="absolute top-2 left-4 md:top-6 md:left-6 lg:top-8 lg:left-8">
            <Link href={tenantHomePath}>
                <TenantLogo showName size="md" className="max-w-[160px]" />
            </Link>
        </div>

        {/* Main Content */}
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
                            {t.auth?.enterCode || 'Enter verification code'}
                        </h1>
                        <p className="text-gray-500 mb-10 text-center lg:text-left">
                            {t.auth?.sentTo || 'We sent a code to'} <span className="font-medium text-black">{email}</span>
                        </p>

                        <form onSubmit={handleVerifyOtp} className="space-y-6">
                            <div className="space-y-2">
                                <label htmlFor="otp" className="block text-sm font-medium text-gray-700 ml-1">
                                    {t.auth?.codeLabel || 'Verification Code'}
                                </label>
                                <input
                                    id="otp"
                                    type="text"
                                    value={otp}
                                    onChange={(e) => setOtp(e.target.value)}
                                    required
                                    autoFocus
                                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-200 tracking-widest text-lg"
                                    placeholder="123456"
                                />
                            </div>

                            <div className="space-y-3 pt-4">
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full flex justify-center items-center py-3.5 px-4 border border-transparent rounded-full text-sm font-medium text-primary-foreground bg-primary hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 transition-all duration-200 shadow-theme-glow"
                                >
                                    {loading 
                                        ? (t.auth?.verifying || 'Verifying...') 
                                        : (t.auth?.verify || 'Verify & Sign in')
                                    }
                                </button>
                                
                                <button
                                    type="button"
                                    onClick={() => setOtpSent(false)}
                                    className="w-full flex justify-center items-center py-3.5 px-4 border border-gray-200 rounded-full text-sm font-medium text-black bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-200 transition-all duration-200"
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
                        <h1 className="text-3xl font-medium text-black mb-10 text-center lg:text-left">
                            {loginMethod === 'magic_link' 
                                ? (t.auth?.signInTitle || 'Sign in with your email')
                                : (t.auth?.signInWithPassword || 'Sign in with password')
                            }
                        </h1>

                        <form onSubmit={loginMethod === 'magic_link' ? handleSendOtp : handlePasswordLogin} className="space-y-6">
                            <div className="space-y-2">
                                <label htmlFor="email" className="block text-sm font-medium text-gray-700 ml-1">
                                    {t.auth?.emailLabel || 'Email'}
                                </label>
                                <input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-200"
                                    placeholder=""
                                />
                            </div>

                            {loginMethod === 'password' && (
                                <div className="space-y-2">
                                    <label htmlFor="password" className="block text-sm font-medium text-gray-700 ml-1">
                                        {t.auth?.passwordLabel || 'Password'}
                                    </label>
                                    <input
                                        id="password"
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-200"
                                    />
                                </div>
                            )}

                            <div className="space-y-3 pt-4">
                                <button
                                    type="submit"
                                    disabled={loading || (loginMethod === 'magic_link' && cooldown > 0)}
                                    className="w-full flex justify-center items-center py-3.5 px-4 border border-transparent rounded-full text-sm font-medium text-primary-foreground bg-primary hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 transition-all duration-200 shadow-theme-glow"
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
                                    className="w-full flex justify-center items-center py-3.5 px-4 border border-gray-200 rounded-full text-sm font-medium text-black bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-200 transition-all duration-200"
                                >
                                    {t.auth?.back || 'Back'}
                                </button>
                            </div>
                        </form>

                        <div className="mt-8 flex items-center justify-between text-sm">
                            <div className="flex items-center gap-1 text-gray-500">
                                {t.auth?.noAccount || 'No account?'} 
                                <Link
                                    href={`${basePath || ''}/register`}
                                    className="font-medium text-black hover:underline ml-1"
                                >
                                    {t.auth?.signUp || 'Sign up'}
                                </Link>
                            </div>
                            
                            <button
                                onClick={() => setLoginMethod(loginMethod === 'magic_link' ? 'password' : 'magic_link')}
                                className="text-gray-400 hover:text-black transition-colors"
                            >
                                {loginMethod === 'magic_link' ? (t.auth?.passwordMode || 'Password') : (t.auth?.emailCodeMode || 'Email Code')}
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="text-xs text-gray-400 text-center lg:text-left mt-8 lg:mt-0 absolute bottom-6 left-0 w-full px-8 md:px-12 lg:px-24">
            {termsText}
        </div>
      </div>

      {/* Right Panel - Visual */}
      <div className="hidden lg:flex w-1/2 bg-black items-center justify-center relative overflow-hidden">
        {/* Background Gradient Effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-black to-black opacity-80" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-r from-gray-800/20 to-transparent rounded-full blur-3xl" />
        
        {/* Abstract Logo */}
        <div className="relative z-10 opacity-10 scale-[3.0] blur-sm">
            <AtomXLogo size={400} showText={false} />
        </div>

        {/* Language Switcher */}
        <div className="absolute bottom-8 right-8 z-20">
            <button
                onClick={toggleLanguage}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white text-sm font-medium transition-all duration-200 border border-white/10"
            >
                <Globe size={16} />
                {getLanguageLabel()}
            </button>
        </div>
      </div>

      {/* Mobile Language Switcher */}
      <div className="absolute top-8 right-8 lg:hidden z-20">
          <button
              onClick={toggleLanguage}
              className="p-2 text-gray-500 hover:text-black transition-colors"
          >
              <Globe size={20} />
          </button>
      </div>
    </div>
  );
}
