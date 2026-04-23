/**
 * 租户布局
 * 
 * 用于 wrap 每个租户页面，提供租户级别的配置
 */

'use client';

import { ReactNode, useMemo, CSSProperties } from 'react';

interface TenantLayoutProps {
  children: ReactNode;
}

export function TenantLayout({ children }: TenantLayoutProps) {
  const accentVariables = useMemo(() => {
    return {
      '--tenant-primary': 'var(--theme-primary)',
      '--tenant-primary-hover': 'var(--theme-primary-hover)',
      '--tenant-primary-active': 'var(--theme-primary-active)',
      '--tenant-primary-strong': 'var(--theme-primary-strong)',
      '--tenant-primary-soft': 'var(--theme-primary-soft)',
      '--tenant-primary-muted': 'var(--theme-primary-muted)',
      '--tenant-primary-border': 'var(--theme-primary-border)',
      '--tenant-primary-ring': 'var(--theme-primary-ring)',
      '--tenant-primary-glow': 'var(--theme-primary-glow)',
      '--tenant-primary-foreground': 'var(--theme-primary-foreground)'
    } as CSSProperties;
  }, []);

  return (
    <div 
      style={accentVariables}
    >
      {children}
    </div>
  );
}
