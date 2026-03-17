'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import { Loader2, Save, Eye, EyeOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import Image from 'next/image';
import wechatQr from '@/logo/WeChat.jpg';
import { useTenant } from '@/hooks/useTenant';

export function ApiKeyModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [isVisible, setIsVisible] = useState(false);
  const { t } = useLanguage();
  const router = useRouter();
  const { basePath } = useTenant();
  const tenantLoginPath = `${basePath || ''}/login`;

  useEffect(() => {
    checkApiKey();
  }, []);

  const checkApiKey = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        router.replace(tenantLoginPath);
        setChecking(false);
        return;
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('api_key')
        .eq('id', session.user.id)
        .maybeSingle();

      if (error) {
        console.error('Error checking API key:', error);
      }

      if (!profile?.api_key) {
        setIsOpen(true);
      }
    } catch (error) {
      console.error('Error checking API key:', error);
    } finally {
      setChecking(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      toast.error(t.apiKeyModal.toast.enterKey);
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error(t.apiKeyModal.toast.userMissing);
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .upsert({ 
          id: user.id,
          api_key: apiKey.trim(),
          updated_at: new Date().toISOString()
        });

      if (error) throw error;

      toast.success(t.apiKeyModal.toast.success);
      setIsOpen(false);
      router.refresh();
    } catch (error: any) {
      console.error('Error saving API key:', error);
      toast.error(error.message || t.apiKeyModal.toast.error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen && !checking) return null;

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden transform transition-all duration-300 scale-100">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {t.apiKeyModal.title}
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            {t.apiKeyModal.subtitle}
          </p>

          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="modal-apiKey" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t.apiKeyModal.label}
              </label>
              <div className="relative">
                <input
                  id="modal-apiKey"
                  type={isVisible ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={t.apiKeyModal.placeholder}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all pr-12"
                  required
                />
                <button
                  type="button"
                  onClick={() => setIsVisible(!isVisible)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-1"
                >
                  {isVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center py-3 px-4 bg-primary text-primary-foreground font-bold rounded-lg hover:bg-primary-hover transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed shadow-theme-glow"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin mr-2" />
                  {t.apiKeyModal.saving}
                </>
              ) : (
                <>
                  <Save size={18} className="mr-2" />
                  {t.apiKeyModal.save}
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-700">
            <div className="flex flex-col items-center text-center space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                {t.apiKeyModal.noKey}
              </p>
              <div className="bg-white p-2 rounded-xl border border-gray-200 shadow-sm">
                <Image 
                  src={wechatQr}
                  alt={t.apiKeyModal.qrAlt} 
                  className="rounded-lg object-cover"
                  width={128}
                  height={128}
                  priority
                />
              </div>
              <p className="text-xs text-gray-500">
                {t.apiKeyModal.scanTip}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
