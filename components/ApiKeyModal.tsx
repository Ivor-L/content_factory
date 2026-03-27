'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import { Loader2, Save, Eye, EyeOff, CheckCircle, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import Image from 'next/image';
import wechatQr from '@/logo/WeChat.jpg';
import { useTenant } from '@/hooks/useTenant';

export function ApiKeyModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [checking, setChecking] = useState(true);
  const [isVisible, setIsVisible] = useState(false);
  const [validationState, setValidationState] = useState<'idle' | 'valid' | 'invalid' | 'bound'>('idle');
  const [balance, setBalance] = useState<number | null>(null);
  const { t } = useLanguage();
  const router = useRouter();
  const { basePath } = useTenant();
  const tenantLoginPath = `${basePath || ''}/login`;

  const checkApiKey = useCallback(async () => {
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
        // 先尝试自动绑定，成功则无需弹窗
        try {
          const res = await fetch('/api/auth/provision-credits', {
            method: 'POST',
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          if (res.ok) {
            const data = await res.json();
            if (data?.ok) return; // 自动绑定成功，不弹窗
          }
        } catch {
          // 自动绑定失败，降级到手动弹窗
        }
        setIsOpen(true);
      }
    } catch (error) {
      console.error('Error checking API key:', error);
    } finally {
      setChecking(false);
    }
  }, [router, tenantLoginPath]);

  useEffect(() => {
    checkApiKey();
  }, [checkApiKey]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      toast.error(t.apiKeyModal.toast.enterKey);
      return;
    }

    setLoading(true);
    setValidating(true);
    setValidationState('idle');
    setBalance(null);

    try {
      // 校验：是否已被绑定 + 是否有效
      const validateRes = await fetch('/api/user/validate-api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      const validateData = await validateRes.json();

      setValidating(false);

      if (validateData.reason === 'already_bound') {
        setValidationState('bound');
        toast.error('该 API Key 已被其他账号绑定');
        return;
      }

      if (!validateData.valid) {
        setValidationState('invalid');
        toast.error('API Key 无效，请检查后重试');
        return;
      }

      setValidationState('valid');
      if (typeof validateData.balance === 'number') {
        setBalance(validateData.balance);
      }

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
      setValidating(false);
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
              {validationState === 'valid' && (
                <p className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400 mt-1.5">
                  <CheckCircle size={14} />
                  Key 有效{balance !== null ? `，余额 ${balance}` : ''}
                </p>
              )}
              {validationState === 'bound' && (
                <p className="flex items-center gap-1.5 text-sm text-red-500 mt-1.5">
                  <XCircle size={14} />
                  该 API Key 已被其他账号绑定
                </p>
              )}
              {validationState === 'invalid' && (
                <p className="flex items-center gap-1.5 text-sm text-red-500 mt-1.5">
                  <XCircle size={14} />
                  API Key 无效，请检查后重试
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-openclaw w-full justify-center py-3 px-4 font-bold"
            >
              {validating ? (
                <>
                  <Loader2 size={18} className="animate-spin mr-2" />
                  校验中...
                </>
              ) : loading ? (
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
