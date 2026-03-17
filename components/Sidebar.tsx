
'use client';

import { usePathname } from 'next/navigation';
import { Home, FileText, Repeat, Sparkles, Video, Settings, Languages, Clapperboard, Key, Users, History, ChevronUp, Activity, Zap, PanelLeftClose, PanelLeftOpen, ChevronLeft, ChevronRight, LayoutGrid, User, LogOut, Film, BookOpen, Gift } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import { useEffect, useState, useCallback, useRef } from 'react';
import { TenantLogo } from './TenantLogo';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import { onCreditsRefresh } from '@/lib/creditsBus';
import { useTenant } from '@/hooks/useTenant';
import { TenantIcon } from './TenantLogo';
import { onProfileRefresh } from '@/lib/profileBus';
import { getProfileInitial } from '@/lib/profile';

type NavigationItem = {
  name: string;
  href: string;
  icon: LucideIcon;
  children?: NavigationItem[];
};

const isNavigationItem = (
  item: NavigationItem | false | null | undefined
): item is NavigationItem => Boolean(item);

function SolidZapIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
    >
      <path fill="currentColor" d="M13 2v8h7L11 22v-8H4L13 2z" />
    </svg>
  );
}

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { language, setLanguage, t } = useLanguage();
  const { tenant, basePath } = useTenant();
  const [mounted, setMounted] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  
  // Credits State
  const [credits, setCredits] = useState<number | null>(null);
  const [loadingCredits, setLoadingCredits] = useState(false);
  const loadingCreditsRef = useRef(false);
  const [profileName, setProfileName] = useState('');
  const [profileAvatarUrl, setProfileAvatarUrl] = useState('');

  const creditsDisplay = loadingCredits ? '…' : (credits !== null ? credits.toLocaleString() : '-');
  const fallbackName = `${tenant.name} ${(t as any).userBlock?.title || 'User'}`;
  const displayName = profileName.trim() || fallbackName;
  const profileInitial = getProfileInitial(displayName);

  const fetchCredits = useCallback(async (force = false) => {
    if (loadingCreditsRef.current && !force) return;
    try {
      loadingCreditsRef.current = true;
      setLoadingCredits(true);
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setCredits(null);
        return;
      }

      const res = await fetch('/api/integration/credits', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        },
        cache: 'no-store'
      });

      if (res.ok) {
        const data = await res.json();
        if (typeof data.balance === 'number') {
          setCredits(data.balance);
        }
      } else if (res.status === 401) {
        setCredits(null);
      }
    } catch (error) {
      console.error('Failed to fetch credits:', error);
    } finally {
      loadingCreditsRef.current = false;
      setLoadingCredits(false);
    }
  }, []);

  const fetchProfile = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setProfileName('');
        setProfileAvatarUrl('');
        return;
      }

      const fallbackFullName =
        typeof user.user_metadata?.full_name === 'string'
          ? user.user_metadata.full_name
          : user.email?.split('@')[0] ?? '';
      const fallbackAvatar =
        typeof user.user_metadata?.avatar_url === 'string'
          ? user.user_metadata.avatar_url
          : '';

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Failed to load profile info:', error);
      }

      setProfileName(profile?.full_name ?? fallbackFullName ?? '');
      setProfileAvatarUrl(profile?.avatar_url ?? fallbackAvatar ?? '');
    } catch (error) {
      console.error('Failed to load profile info:', error);
      setProfileName('');
      setProfileAvatarUrl('');
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    const storedCollapsed = localStorage.getItem('sidebar-collapsed');
    if (storedCollapsed) {
      setIsCollapsed(storedCollapsed === 'true');
    }
    void fetchCredits();

    const off = onCreditsRefresh(() => {
      void fetchCredits(true);
    });

    return () => {
      off();
    };
  }, [fetchCredits]);

  useEffect(() => {
    const handleExternalToggle = (event: Event) => {
      const customEvent = event as CustomEvent<{ collapsed?: boolean }>;
      const nextState = customEvent.detail?.collapsed;
      if (typeof nextState !== 'boolean') return;
      setIsCollapsed(nextState);
      localStorage.setItem('sidebar-collapsed', String(nextState));
    };

    window.addEventListener('sidebar:external-toggle', handleExternalToggle);
    return () => {
      window.removeEventListener('sidebar:external-toggle', handleExternalToggle);
    };
  }, []);
  
  useEffect(() => {
    void fetchProfile();
    const off = onProfileRefresh(() => {
      void fetchProfile();
    });
    return () => {
      off();
    };
  }, [fetchProfile]);

  const isJubaopenTenant = tenant.slug === 'jubaopen';
  const isNextideTenant = tenant.slug === 'nextide';
  const toggleSidebar = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem('sidebar-collapsed', String(newState));
  };
  const AvatarCircle = () => (
    <div className="w-10 h-10 rounded-full border border-[var(--tenant-primary-muted)] overflow-hidden flex items-center justify-center bg-[var(--tenant-primary)] text-[var(--tenant-primary-foreground)] font-bold text-lg shrink-0 shadow-theme-glow">
      {profileAvatarUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element -- User avatars use Supabase public URLs */
        <img src={profileAvatarUrl} alt={displayName} className="w-full h-full object-cover" />
      ) : (
        profileInitial
      )}
    </div>
  );

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      toast.success('Signed out successfully');
      const tenantLoginPath = `${basePath || ''}/login`;
      router.push(tenantLoginPath);
      router.refresh();
    } catch (error) {
      console.error('Error signing out:', error);
      toast.error('Failed to sign out');
    }
  };

  // 根据租户配置生成导航菜单
  const navigation = (
    [
      tenant.features.dashboard && { name: t.sidebar.home, href: `${basePath}/dashboard`, icon: Home },
      tenant.features.scripts && { name: t.sidebar.scripts, href: `${basePath}/scripts`, icon: Zap },
      tenant.features.contentCreation && { name: t.sidebar.contentCreation, href: `${basePath}/content`, icon: FileText },
      tenant.features.knowledgeVideos && { name: t.sidebar.knowledgeVideos || "Knowledge Videos", href: `${basePath}/knowledge-videos`, icon: Film },
      tenant.features.storyboard && { name: t.storyboard.title, href: `${basePath}/storyboard`, icon: Clapperboard },
      tenant.features.replication && { name: t.sidebar.replication, href: `${basePath}/replication`, icon: Video },
      (tenant.features.products || tenant.features.characters || tenant.features.assetLibrary) && {
        name: t.sidebar.assets,
        href: `${basePath}/resources`,
        icon: BookOpen
      },
    ] as Array<NavigationItem | false | undefined>
  ).filter(isNavigationItem);

  if (!mounted) return <div className="w-64 bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800" />;

  return (
    <div 
      className={cn(
        "flex flex-col h-full bg-white/90 dark:bg-gray-950/70 text-gray-700 dark:text-gray-300 shrink-0 font-sans border-r border-[var(--tenant-primary-muted)] shadow-[0_0_45px_rgba(0,0,0,0.08)] backdrop-blur-xl transition-all duration-300 relative group",
        isCollapsed ? "w-20" : "w-64"
      )}
      style={{ overflow: 'visible' }}
    >
      <button 
        onClick={toggleSidebar}
        className={cn(
            "absolute -right-3 top-1/2 -translate-y-1/2 w-7 h-7 bg-[var(--tenant-primary)] text-[var(--tenant-primary-foreground)] rounded-full flex items-center justify-center shadow-theme-glow hover:shadow-[0_8px_30px_var(--theme-primary-glow)] opacity-0 group-hover:opacity-100 transition-all duration-300 focus-visible:ring-2 focus-visible:ring-[var(--tenant-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900 outline-none",
            isCollapsed && "opacity-100",
            isUserMenuOpen ? "z-0" : "z-50"
        )}
        title={isCollapsed ? "Expand" : "Collapse"}
      >
        {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {/* Header with Logo */}
      <div className={cn("flex items-center h-20 overflow-hidden transition-all duration-300 px-6", isCollapsed ? "justify-center px-0" : "justify-start")}>
        {isJubaopenTenant ? (
          isCollapsed ? (
            <div className="flex items-center justify-center">
              <div className="h-9 w-9 rounded-full overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element -- Tenant logos rely on remote URLs */}
                <img
                  src={tenant.browserLogo || '/logo/jubaopeng_logo.svg'}
                  alt={tenant.name}
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full overflow-hidden shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element -- Tenant logos rely on remote URLs */}
                <img
                  src="/logo/jubaopeng_logo.svg"
                  alt={`${tenant.name} icon`}
                  className="h-full w-full object-cover"
                />
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element -- Tenant logos rely on remote URLs */}
              <img
                src="/logo/jubaopen_txt.svg"
                alt={`${tenant.name} wordmark`}
                className="object-contain"
                style={{ height: '1.875rem' }}
              />
            </div>
          )
        ) : isNextideTenant && isCollapsed ? (
          <div className="flex items-center justify-center">
            <div className="h-12 w-12 rounded-full bg-black flex items-center justify-center overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element -- Tenant logos rely on remote URLs */}
              <img
                src="/logo/黑底白色鲸鱼logo_SVG.svg"
                alt={tenant.name}
                className="h-10 w-10 object-contain"
              />
            </div>
          </div>
        ) : (
          <div className={cn("transition-transform duration-300", isCollapsed && "scale-75")}>
            <TenantLogo showName={!isCollapsed} size={isCollapsed ? 'sm' : 'md'} />
          </div>
        )}
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
                             "relative flex items-center gap-4 text-base font-medium rounded-xl transition-colors duration-200 group hover:z-[60]",
                             isActive
                             ? 'text-[var(--tenant-primary-foreground)] z-10'
                             : 'text-gray-600 dark:text-gray-200 hover:bg-[var(--tenant-primary-muted)] hover:text-gray-900 dark:hover:text-white z-0',
                             isCollapsed ? "justify-center px-2 py-3" : "px-4 py-3"
                         )}
                        >
                        {isActive && (
                            <motion.div
                                layoutId="sidebar-active-bg"
                                className="absolute inset-0 bg-[var(--tenant-primary)] rounded-xl shadow-theme-glow -z-10"
                                initial={false}
                                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                            />
                        )}

                        <child.icon className={cn(
                            "w-5 h-5 transition-colors shrink-0 relative z-10", 
                            isActive ? 'text-[var(--tenant-primary-foreground)]' : 'text-gray-400 dark:text-gray-500 group-hover:text-[var(--tenant-primary)]'
                        )} />
                        
                        {!isCollapsed && (
                            <span className="truncate text-sm relative z-10 font-medium">{child.name}</span>
                        )}

                        {/* Tooltip for collapsed state */}
                        {isCollapsed && hoveredItem === child.name && (
                            <div className="absolute left-full top-1/2 -translate-y-1/2 ml-4 px-3 py-1.5 bg-[var(--tenant-primary)] text-[var(--tenant-primary-foreground)] text-sm font-medium rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-[100] transition-all duration-200 shadow-theme-glow translate-x-[-4px] group-hover:translate-x-0">
                                <div className="absolute left-0 top-1/2 -translate-x-full -translate-y-1/2 w-0 h-0 border-[6px] border-transparent border-r-[var(--tenant-primary)]"></div>
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
                "relative flex items-center gap-4 text-base font-medium rounded-xl transition-colors duration-200 group hover:z-[60]",
                isActive
                  ? 'text-[var(--tenant-primary-foreground)] z-10'
                  : 'text-gray-600 dark:text-gray-200 hover:bg-[var(--tenant-primary-muted)] hover:text-gray-900 dark:hover:text-white z-0',
                isCollapsed ? "justify-center px-2 py-3" : "px-4 py-3"
              )}
            >
              {isActive && (
                    <motion.div
                        layoutId="sidebar-active-bg"
                        className="absolute inset-0 bg-[var(--tenant-primary)] rounded-xl shadow-theme-glow -z-10"
                        initial={false}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                )}

              <item.icon className={cn(
                "w-5 h-5 transition-colors shrink-0 relative z-10", 
                isActive ? 'text-[var(--tenant-primary-foreground)]' : 'text-gray-400 dark:text-gray-500 group-hover:text-[var(--tenant-primary)]'
              )} />
              
              {!isCollapsed && (
                <span className="truncate relative z-10 font-medium">{item.name}</span>
              )}

              {/* Tooltip for collapsed state */}
              {isCollapsed && hoveredItem === item.name && (
                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-4 px-3 py-1.5 bg-[var(--tenant-primary)] text-[var(--tenant-primary-foreground)] text-sm font-medium rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-[100] transition-all duration-200 shadow-theme-glow translate-x-[-4px] group-hover:translate-x-0">
                  <div className="absolute left-0 top-1/2 -translate-x-full -translate-y-1/2 w-0 h-0 border-[6px] border-transparent border-r-[var(--tenant-primary)]"></div>
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
        <AnimatePresence>
          {isUserMenuOpen && (
            <>
              <motion.div
                key="user-menu-overlay"
                className="fixed inset-0 z-10 bg-[var(--tenant-primary)]/20 backdrop-blur-[2px]"
                onClick={() => setIsUserMenuOpen(false)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              />
              <motion.div
                key="user-menu-panel"
                initial={{ opacity: 0, y: 16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.97 }}
                transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                className={cn(
                  "absolute bottom-full mb-2 bg-white dark:bg-gray-800 rounded-xl shadow-2xl shadow-black/15 dark:shadow-black/40 border border-gray-100 dark:border-gray-700 z-20 overflow-hidden backdrop-blur",
                  isCollapsed ? "left-14 w-48" : "left-4 right-4"
                )}
              >
                <div className="py-1">
                  <Link
                    href={`${basePath || ''}/share`}
                    onClick={() => setIsUserMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <Gift size={16} />
                    {t.userBlock?.referrals?.title || '分享有礼'}
                  </Link>
                  <div className="h-px bg-gray-100 dark:bg-gray-700 my-1 mx-2" />
                  <Link 
                    href="/"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setIsUserMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <Home size={16} />
                    {t.userBlock?.website || 'Official Website'}
                  </Link>

                  <Link 
                    href={`${basePath || ''}/settings`}
                    onClick={() => setIsUserMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <Key size={16} />
                    {t.userBlock?.api || 'API_key & Settings'}
                  </Link>
                  
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
                    href={`${basePath || ''}/usage`}
                    onClick={() => setIsUserMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <History size={16} />
                    {t.userBlock?.usage || 'Credits Usage Log'}
                  </Link>

                  <div className="h-px bg-gray-100 dark:bg-gray-700 my-1 mx-2" />

                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <LogOut size={16} />
                    {(t as any).userBlock?.signOut || 'Sign Out'}
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        <button 
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className={cn(
              "flex items-center gap-3 w-full p-2 rounded-xl hover:bg-[var(--tenant-primary-muted)] transition-colors group",
              isCollapsed ? "justify-center" : ""
            )}
        >
            {isCollapsed ? (
              <div className="flex flex-col items-center gap-1">
                <AvatarCircle />
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--tenant-primary)]/20 text-[var(--tenant-primary-foreground)] border border-[var(--tenant-primary)]/30 shadow-theme-glow">
                  <SolidZapIcon size={12} className="text-[var(--tenant-primary)]" />
                  <span className="text-[10px] font-semibold tabular-nums">
                    {creditsDisplay}
                  </span>
                </div>
              </div>
            ) : (
              <AvatarCircle />
            )}
            
            {!isCollapsed && (
              <>
                <div className="flex-1 text-left min-w-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                        {displayName}
                    </p>
                    <div className="mt-1 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--tenant-primary)]/20 text-[var(--tenant-primary-foreground)] border border-[var(--tenant-primary)]/30 shadow-theme-glow">
                      <SolidZapIcon size={14} className="text-[var(--tenant-primary)]" />
                      <span className="text-xs font-semibold tabular-nums">
                        {creditsDisplay}
                      </span>
                    </div>
                </div>
                <ChevronUp size={16} className={`text-gray-400 transition-transform duration-200 ${isUserMenuOpen ? 'rotate-180' : ''}`} />
              </>
            )}
        </button>
      </div>
    </div>
  );
}
