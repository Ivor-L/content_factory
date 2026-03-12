/**
 * 租户 Hook
 * 
 * 用于在组件中获取当前租户配置
 */

'use client';

import { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { TenantConfig, getTenantConfig, VALID_TENANT_SLUGS } from '@/lib/tenants/config';

interface TenantContextType {
  tenant: TenantConfig;
  tenantSlug: string;
  isLoading: boolean;
  basePath: string;
}

const TenantContext = createContext<TenantContextType>({
  tenant: getTenantConfig('crossborder'),
  tenantSlug: 'crossborder',
  isLoading: true,
  basePath: '',
});

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [tenant, setTenant] = useState<TenantConfig>(getTenantConfig('crossborder'));
  const [tenantSlug, setTenantSlug] = useState('crossborder');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // 从路径解析租户
    const segments = pathname.split('/').filter(Boolean);
    const firstSegment = segments[0];

    // 检查是否为已知租户路径
    if (firstSegment && VALID_TENANT_SLUGS.includes(firstSegment)) {
      setTenantSlug(firstSegment);
      setTenant(getTenantConfig(firstSegment));
    } else {
      // 默认使用 crossborder
      setTenantSlug('crossborder');
      setTenant(getTenantConfig('crossborder'));
    }

    setIsLoading(false);
  }, [pathname]);

  const basePath = useMemo(() => {
    return tenantSlug === 'crossborder' ? '' : `/${tenantSlug}`;
  }, [tenantSlug]);

  return (
    <TenantContext.Provider value={{ tenant, tenantSlug, isLoading, basePath }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) {
    // 如果在 Provider 外使用，返回默认值
    return {
      tenant: getTenantConfig('crossborder'),
      tenantSlug: 'crossborder',
      isLoading: false,
      basePath: '',
    };
  }
  return context;
}

/**
 * 获取带租户前缀的路径
 */
export function useTenantPath(path: string): string {
  const { basePath } = useTenant();
  // 移除路径开头的斜杠
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${basePath}/${cleanPath}`;
}

/**
 * 获取当前路径的租户路径
 */
export function getCurrentTenantPath(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  const firstSegment = segments[0];

  if (firstSegment && VALID_TENANT_SLUGS.includes(firstSegment)) {
    return `/${segments.slice(1).join('/')}`;
  }

  return pathname;
}
