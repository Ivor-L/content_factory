'use client';

import { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Eye, EyeOff, Edit2, Check, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import { emitCreditsRefresh } from '@/lib/creditsBus';

export default function SettingsPage() {
  const { t } = useLanguage();
  const [apiKey, setApiKey] = useState('');
  const [isVisible, setIsVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [creditsError, setCreditsError] = useState<string | null>(null);
  
  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchCredits = async () => {
    try {
      setCreditsLoading(true);
      setCreditsError(null);

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        setCreditsError(t.settings.loginRequired);
        return;
      }

      const res = await fetch('/api/integration/credits', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-User-Api-Key': apiKey
        },
        cache: 'no-store'
      });

      if (res.status === 404) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      const res2 = res.status === 404
        ? await fetch('/api/integration/credits', {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
              'X-User-Api-Key': apiKey
            },
            cache: 'no-store'
          })
        : res;

      const data = await res2.json().catch(() => null);

      if (!res2.ok) {
        setCredits(null);
        const details = typeof data?.details === 'string' ? data.details : null;
        const baseInfo = typeof data?.base === 'string' && data.base.length > 0 ? ` [${data.base}]` : '';
        const base = typeof data?.error === 'string' ? data.error : t.settings.creditsFetchFailed;
        setCreditsError(details ? `${base}${baseInfo}: ${details}` : `${base}${baseInfo}`);
        return;
      }

      const balance = typeof data?.balance === 'number' ? data.balance : null;
      setCredits(balance);
      emitCreditsRefresh();
      if (balance === null) {
        setCreditsError(t.settings.creditsFetchFailed);
      }
    } catch {
      setCredits(null);
      setCreditsError(t.settings.creditsFetchFailed);
    } finally {
      setCreditsLoading(false);
    }
  };

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        // First check if we can access the profiles table
        // This helps detect if the table exists or if there are RLS issues
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('api_key')
          .eq('id', user.id)
          .maybeSingle(); // Use maybeSingle to avoid error if no row exists

        if (error) {
          console.error('Error fetching profile:', error);
          // If error (e.g. table not found), fallback to edit mode
          setIsEditing(true);
        } else if (profile?.api_key) {
          setApiKey(profile.api_key);
          void fetchCredits();
        } else {
          setIsEditing(true);
        }
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      setIsEditing(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error('Please login first');
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .upsert({ 
          id: user.id,
          api_key: apiKey,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;

      setIsEditing(false);
      setSaved(true);
      toast.success('API Key saved successfully');
      void fetchCredits();
      emitCreditsRefresh();
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error('Error saving API key:', error);
      toast.error('Failed to save API Key');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 font-sans">
      <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-white">{t.settings.title}</h1>
      
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-8 border border-gray-100 dark:border-gray-700">
        <h2 className="text-xl font-bold mb-6 text-gray-900 dark:text-white">{t.settings.apiConfiguration}</h2>
        <form onSubmit={handleSave} className="space-y-6">
          <div>
            <label htmlFor="apiKey" className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
              {t.settings.apiKey}
            </label>
            <div className="relative">
              <input
                type={isVisible ? "text" : "password"}
                id="apiKey"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={!isEditing}
                className={`w-full border rounded-lg pl-4 pr-12 py-3 focus:ring-2 focus:ring-black dark:focus:ring-white focus:border-transparent outline-none transition-all ${
                  isEditing 
                    ? "bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white" 
                    : "bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                }`}
                placeholder="sk-..."
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
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              {t.settings.apiKeyDesc}
            </p>
          </div>

          <div className="flex items-start justify-between gap-6 rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-4 py-3">
            <div>
              <div className="text-sm font-bold text-gray-700 dark:text-gray-300">
                {t.settings.creditsBalance}
              </div>
              <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                {creditsLoading ? (
                  <span className="inline-flex items-center gap-2 text-sm font-bold text-gray-600 dark:text-gray-300">
                    <Loader2 size={16} className="animate-spin" />
                    {t.common.loading}
                  </span>
                ) : apiKey ? (
                  credits ?? '-'
                ) : (
                  '-'
                )}
              </div>
              {(!apiKey || creditsError) && (
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {!apiKey ? t.settings.creditsUnavailable : creditsError}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                void fetchCredits();
              }}
              disabled={creditsLoading || !apiKey}
              className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 font-bold rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-200 uppercase tracking-wide text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw size={16} />
              {t.settings.refreshCredits}
            </button>
          </div>
          
          <div className="flex items-center justify-end pt-2">
            {isEditing ? (
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-6 py-2.5 bg-black dark:bg-white text-white dark:text-black font-bold rounded-lg hover:opacity-90 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black shadow-lg shadow-black/20 uppercase tracking-wide text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={3} />}
                {saving ? 'Saving...' : t.settings.save}
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setIsEditing(true);
                }}
                className="flex items-center gap-2 px-6 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 font-bold rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-200 uppercase tracking-wide text-sm"
              >
                <Edit2 size={16} />
                {t.common.edit}
              </button>
            )}
            
            {saved && !isEditing && (
              <span className="ml-4 text-green-600 dark:text-green-400 text-sm font-bold flex items-center bg-green-50 dark:bg-green-900/20 px-3 py-1 rounded-full animate-in fade-in slide-in-from-left-2 duration-300">
                <Check size={14} className="mr-1.5" strokeWidth={3} />
                {t.settings.saved}
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
