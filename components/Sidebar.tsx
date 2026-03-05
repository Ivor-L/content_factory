
'use client';

import { usePathname } from 'next/navigation';
import { Home, Package, FileText, Repeat, Sparkles, Video, Settings, Sun, Moon, Languages, Clapperboard, Key, Users, History, ChevronUp, Activity, Zap, PanelLeftClose, PanelLeftOpen, ChevronLeft, ChevronRight, LayoutGrid, User } from 'lucide-react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useLanguage } from '@/contexts/LanguageContext';
import { useEffect, useState } from 'react';
import { AtomXLogo } from './AtomXLogo';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

export function Sidebar() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const [mounted, setMounted] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    // Check local storage for collapsed state preference
    const storedCollapsed = localStorage.getItem('sidebar-collapsed');
    if (storedCollapsed) {
      setIsCollapsed(storedCollapsed === 'true');
    }
  }, []);

  const toggleSidebar = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem('sidebar-collapsed', String(newState));
  };

  const navigation = [
    { name: t.sidebar.home, href: '/', icon: Home },
    { name: t.sidebar.scripts, href: '/scripts', icon: Zap },
    { name: t.sidebar.storyboardGen, href: '/storyboard-gen', icon: LayoutGrid },
    { name: t.storyboard.title, href: '/storyboard', icon: Clapperboard },
    { name: t.sidebar.digitalHuman, href: '/digital-human', icon: User },
    { name: t.sidebar.replication, href: '/replication', icon: Video },
    { 
      name: t.sidebar.assets, 
      href: '#', 
      icon: Package,
      children: [
        { name: t.products.title, href: '/products', icon: Package },
        { name: t.characters.title, href: '/characters', icon: Users },
      ]
    },
  ];

  if (!mounted) return <div className="w-64 bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800" />;

  return (
    <div 
      className={cn(
        "flex flex-col h-full bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 shrink-0 font-sans border-r border-gray-100 dark:border-gray-800 transition-all duration-300 relative group",
        isCollapsed ? "w-20" : "w-64"
      )}
      style={{ overflow: 'visible' }}
    >
      <button 
        onClick={toggleSidebar}
        className={cn(
            "absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,0.12)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.16)] text-gray-400 hover:text-gray-900 dark:hover:text-white z-50 opacity-0 group-hover:opacity-100 transition-all duration-300 focus:outline-none outline-none",
            isCollapsed && "opacity-100" 
        )}
        title={isCollapsed ? "Expand" : "Collapse"}
      >
        {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {/* Header with Logo */}
      <div className={cn("flex items-center h-20 overflow-hidden transition-all duration-300 px-6", isCollapsed ? "justify-center px-0" : "justify-start")}>
        <div className={cn("transition-transform duration-300", isCollapsed && "scale-75")}>
          <AtomXLogo size={isCollapsed ? 60 : 120} isCollapsed={isCollapsed} />
        </div>
      </div>
      
      <nav className="flex-1 px-3 py-2 space-y-2 overflow-y-visible custom-scrollbar">
        <AnimatePresence>
        {navigation.map((item) => {
          if (item.children) {
             return (
               <div key={item.name} className="space-y-1">
                 {!isCollapsed && (
                   <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                     {item.name}
                   </div>
                 )}
                 {item.children.map((child) => {
                    const isActive = pathname === child.href;
                    return (
                        <Link
                        key={child.href}
                        href={child.href}
                        onMouseEnter={() => setHoveredItem(child.name)}
                        onMouseLeave={() => setHoveredItem(null)}
                        className={cn(
                             "relative flex items-center gap-4 text-base font-normal rounded-xl transition-colors duration-200 group hover:z-[60]",
                             isActive
                             ? 'text-white z-10'
                             : 'text-black dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 z-0',
                             isCollapsed ? "justify-center px-2 py-3" : "px-4 py-3"
                         )}
                        >
                        {isActive && (
                            <motion.div
                                layoutId="sidebar-active-bg"
                                className="absolute inset-0 bg-black dark:bg-white rounded-xl shadow-lg shadow-black/20 dark:shadow-white/20 -z-10"
                                initial={false}
                                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                            />
                        )}

                        <child.icon className={cn(
                            "w-5 h-5 transition-colors shrink-0 relative z-10", 
                            isActive ? 'text-white dark:text-black' : 'text-black dark:text-white group-hover:text-current dark:group-hover:text-current'
                        )} />
                        
                        {!isCollapsed && (
                            <span className="truncate text-sm relative z-10 font-medium">{child.name}</span>
                        )}

                        {/* Tooltip for collapsed state */}
                        {isCollapsed && hoveredItem === child.name && (
                            <div className="absolute left-full top-1/2 -translate-y-1/2 ml-4 px-3 py-1.5 bg-black text-white text-sm font-medium rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-[100] transition-all duration-200 shadow-xl translate-x-[-4px] group-hover:translate-x-0">
                                <div className="absolute left-0 top-1/2 -translate-x-full -translate-y-1/2 w-0 h-0 border-[6px] border-transparent border-r-black"></div>
                                {child.name}
                            </div>
                        )}
                        </Link>
                    );
                 })}
               </div>
             );
          }

          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onMouseEnter={() => setHoveredItem(item.name)}
              onMouseLeave={() => setHoveredItem(null)}
              className={cn(
                "relative flex items-center gap-4 text-base font-normal rounded-xl transition-colors duration-200 group hover:z-[60]",
                isActive
                  ? 'text-white z-10'
                  : 'text-black dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 z-0',
                isCollapsed ? "justify-center px-2 py-3" : "px-4 py-3"
              )}
            >
              {isActive && (
                    <motion.div
                        layoutId="sidebar-active-bg"
                        className="absolute inset-0 bg-black dark:bg-white rounded-xl shadow-lg shadow-black/20 dark:shadow-white/20 -z-10"
                        initial={false}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                )}

              <item.icon className={cn(
                "w-5 h-5 transition-colors shrink-0 relative z-10", 
                isActive ? 'text-white dark:text-black' : 'text-black dark:text-white group-hover:text-current dark:group-hover:text-current'
              )} />
              
              {!isCollapsed && (
                <span className="truncate relative z-10 font-medium">{item.name}</span>
              )}

              {/* Tooltip for collapsed state */}
              {isCollapsed && hoveredItem === item.name && (
                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-4 px-3 py-1.5 bg-black text-white text-sm font-medium rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-[100] transition-all duration-200 shadow-xl translate-x-[-4px] group-hover:translate-x-0">
                  <div className="absolute left-0 top-1/2 -translate-x-full -translate-y-1/2 w-0 h-0 border-[6px] border-transparent border-r-black"></div>
                  {item.name}
                </div>
              )}
            </Link>
          );
        })}
        </AnimatePresence>
      </nav>

      {/* User Block */}
      <div className={cn("border-t border-gray-100 dark:border-gray-800 relative transition-all duration-300", isCollapsed ? "p-2" : "p-4")}>
        
        {/* Dropdown Menu */}
        {isUserMenuOpen && (
            <>
                <div 
                    className="fixed inset-0 z-10" 
                    onClick={() => setIsUserMenuOpen(false)} 
                />
                <div className={cn(
                  "absolute bottom-full mb-2 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 z-20 overflow-hidden animate-in slide-in-from-bottom-2 fade-in duration-200",
                  isCollapsed ? "left-14 w-48" : "left-4 right-4"
                )}>
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
            className={cn(
              "flex items-center gap-3 w-full p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group",
              isCollapsed ? "justify-center" : ""
            )}
        >
            <div className="w-10 h-10 rounded-full bg-black dark:bg-white flex items-center justify-center text-white dark:text-black font-bold text-lg shrink-0">
                A
            </div>
            
            {!isCollapsed && (
              <>
                <div className="flex-1 text-left min-w-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                        AtomX {(t as any).userBlock?.title || 'User'}
                    </p>
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                        {(t as any).common?.credits || 'Credits'} <span className="text-black dark:text-white font-bold">195</span>
                    </p>
                </div>
                <ChevronUp size={16} className={`text-gray-400 transition-transform duration-200 ${isUserMenuOpen ? 'rotate-180' : ''}`} />
              </>
            )}
        </button>
      </div>
    </div>
  );
}
