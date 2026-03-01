'use client';

import { usePathname } from 'next/navigation';
import { Home, Package, FileText, Repeat, Sparkles, Video, Settings, Sun, Moon, Languages, Clapperboard, Key, Users, History, ChevronUp, Activity, Zap } from 'lucide-react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useLanguage } from '@/contexts/LanguageContext';
import { useEffect, useState } from 'react';
import { AtomXLogo } from './AtomXLogo';

export function Sidebar() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const [mounted, setMounted] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const navigation = [
    { name: t.sidebar.home, href: '/', icon: Home },
    { name: t.sidebar.scripts, href: '/scripts', icon: Zap },
    { name: t.storyboard.title, href: '/storyboard', icon: Clapperboard },
    { name: t.sidebar.replication, href: '/replication', icon: Video },
    { name: t.sidebar.products, href: '/products', icon: Package },
    { name: t.characters.title, href: '/characters', icon: Users },
  ];

  if (!mounted) return <div className="w-64 bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800" />;

  return (
    <div className="flex flex-col h-full w-64 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 shrink-0 font-sans border-r border-gray-100 dark:border-gray-800 transition-colors duration-300">
      <div className="flex items-center justify-between px-6 h-20">
        <AtomXLogo size={100} />
      </div>
      
      <nav className="flex-1 px-4 py-2 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center px-4 py-3 text-base font-normal rounded-xl transition-all duration-200 group ${
                isActive
                  ? 'text-white bg-black dark:bg-brand-yellow dark:text-black shadow-lg shadow-black/20 dark:shadow-brand-yellow/20'
                  : 'text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <item.icon className={`w-5 h-5 mr-4 transition-colors ${isActive ? 'text-white dark:text-black' : 'text-gray-400 group-hover:text-black dark:group-hover:text-white'}`} />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* User Block */}
      <div className="p-4 border-t border-gray-100 dark:border-gray-800 relative">
        
        {/* Dropdown Menu */}
        {isUserMenuOpen && (
            <>
                <div 
                    className="fixed inset-0 z-10" 
                    onClick={() => setIsUserMenuOpen(false)} 
                />
                <div className="absolute bottom-full left-4 right-4 mb-2 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 z-20 overflow-hidden animate-in slide-in-from-bottom-2 fade-in duration-200">
                    <div className="py-1">
                        <Link 
                            href="/settings"
                            onClick={() => setIsUserMenuOpen(false)}
                            className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                            <Key size={16} />
                            {t.userBlock?.api || 'API Configuration'}
                        </Link>
                        
                        <button
                            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                            {t.userBlock?.theme || 'Theme Color'}
                        </button>

                        <button
                            onClick={() => {
                                if (language === 'en') setLanguage('zh');
                                else if (language === 'zh') setLanguage('zh-TW');
                                else setLanguage('en');
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                            <Languages size={16} />
                            <span className="flex-1 text-left">{t.userBlock?.language || 'Language'}</span>
                            <span className="text-xs text-gray-400 font-medium">
                                {language === 'en' ? 'EN' : language === 'zh' ? '简' : '繁'}
                            </span>
                        </button>

                        <Link 
                            href="/usage"
                            onClick={() => setIsUserMenuOpen(false)}
                            className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                            <History size={16} />
                            {t.userBlock?.usage || 'Usage History'}
                        </Link>
                    </div>
                </div>
            </>
        )}

        <button 
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="flex items-center gap-3 w-full p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
        >
            <div className="w-10 h-10 rounded-full bg-brand-yellow flex items-center justify-center text-black font-bold text-lg shrink-0">
                A
            </div>
            <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                    AtomX {(t as any).userBlock?.title || 'User'}
                </p>
                <p className="text-xs text-gray-500 flex items-center gap-1">
                    {(t as any).common?.credits || 'Credits'} <span className="text-black dark:text-white font-bold">195</span>
                </p>
            </div>
            <ChevronUp size={16} className={`text-gray-400 transition-transform duration-200 ${isUserMenuOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>
    </div>
  );
}
