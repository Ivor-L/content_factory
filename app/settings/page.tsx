'use client';

import { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Eye, EyeOff, Edit2, Check } from 'lucide-react';

export default function SettingsPage() {
  const { t } = useLanguage();
  const [apiKey, setApiKey] = useState('');
  const [isVisible, setIsVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  
  useEffect(() => {
    // Load API Key from localStorage on mount
    const storedApiKey = localStorage.getItem('user_api_key');
    if (storedApiKey) {
      setApiKey(storedApiKey);
    } else {
      setIsEditing(true); // If no key, start in edit mode
    }
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('user_api_key', apiKey);
    setIsEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
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
                className={`w-full border rounded-lg pl-4 pr-12 py-3 focus:ring-2 focus:ring-brand-yellow focus:border-transparent outline-none transition-all ${
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
          
          <div className="flex items-center justify-end pt-2">
            {isEditing ? (
              <button
                type="submit"
                className="flex items-center gap-2 px-6 py-2.5 bg-black dark:bg-brand-yellow text-white dark:text-black font-bold rounded-lg hover:opacity-90 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black shadow-lg shadow-black/20 uppercase tracking-wide text-sm"
              >
                <Check size={16} strokeWidth={3} />
                {t.settings.save}
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
