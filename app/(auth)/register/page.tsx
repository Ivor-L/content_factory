'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import Link from 'next/link';
import { TenantLogo } from '@/components/TenantLogo';
import { AtomXLogo } from '@/components/AtomXLogo';
import { useLanguage } from '@/contexts/LanguageContext';
import { Globe } from 'lucide-react';
import { useTenant } from '@/hooks/useTenant';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { t, language, setLanguage } = useLanguage();
  const { basePath } = useTenant();
  const [mounted, setMounted] = useState(false);
  const tenantHomePath = basePath || '/';
  const tenantLoginPath = `${basePath || ''}/login`;

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) throw error;

      toast.success('Registration successful! Please check your email to verify.');
      // Optionally redirect to login or dashboard
      // router.push('/login'); 
    } catch (error: any) {
      toast.error(error.message || 'Failed to register');
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

  if (!mounted) return null;

  return (
    <div className="flex min-h-screen w-full bg-white dark:bg-black font-sans selection:bg-black selection:text-white">
      {/* Left Panel - Content */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center p-8 md:p-12 lg:p-24 relative z-10">
        {/* Logo */}
        <div className="absolute top-6 left-6 md:top-10 md:left-10">
            <Link href={tenantHomePath}>
                <TenantLogo showName size="lg" />
            </Link>
        </div>

        {/* Main Content */}
        <div className="w-full max-w-[400px] mx-auto">
            <h1 className="text-3xl font-medium text-black mb-10 text-center lg:text-left">
                {t.auth?.createAccount || 'Create your account'}
            </h1>

            <form onSubmit={handleRegister} className="space-y-6">
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
                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all duration-200"
                    />
                </div>

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
                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all duration-200"
                    />
                </div>

                <div className="space-y-3 pt-4">
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full flex justify-center items-center py-3.5 px-4 border border-transparent rounded-full text-sm font-medium text-white bg-black hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black disabled:opacity-50 transition-all duration-200 shadow-lg shadow-black/10"
                    >
                        {loading 
                            ? (t.auth?.creating || 'Creating account...') 
                            : (t.auth?.signUp || 'Sign up')
                        }
                    </button>
                    
                    <button
                        type="button"
                        onClick={() => router.push(tenantLoginPath)}
                        className="w-full flex justify-center items-center py-3.5 px-4 border border-gray-200 rounded-full text-sm font-medium text-black bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-200 transition-all duration-200"
                    >
                        {t.auth?.back || 'Back'}
                    </button>
                </div>
            </form>

            <div className="mt-8 flex items-center justify-center text-sm">
                <div className="flex items-center gap-1 text-gray-500">
                    {t.auth?.alreadyHaveAccount || 'Already have an account?'} 
                    <Link href={tenantLoginPath} className="font-medium text-black hover:underline ml-1">
                        {t.auth?.signIn || 'Sign in'}
                    </Link>
                </div>
            </div>
        </div>

        {/* Footer */}
        <div className="text-xs text-gray-400 text-center lg:text-left mt-8 lg:mt-0 absolute bottom-6 left-0 w-full px-8 md:px-12 lg:px-24">
            {t.auth?.termsPrivacy || "By continuing you agree to AtomX's Terms of Service and Privacy Policy."}
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
