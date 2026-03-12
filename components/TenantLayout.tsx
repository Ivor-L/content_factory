/**
 * 租户布局
 * 
 * 用于 wrap 每个租户页面，提供租户级别的配置
 */

'use client';

import { ReactNode } from 'react';
import { useTenant } from '@/hooks/useTenant';

interface TenantLayoutProps {
  children: ReactNode;
}

export function TenantLayout({ children }: TenantLayoutProps) {
  const { tenant, isLoading } = useTenant();

  // 可以在此处添加租户级别的样式或逻辑

  return (
    <div 
      style={{ 
        '--tenant-primary': tenant.primaryColor || '#007AFF' 
      } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
