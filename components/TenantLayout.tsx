/**
 * 租户布局
 * 
 * 用于 wrap 每个租户页面，提供租户级别的配置
 */

'use client';

import { ReactNode, useMemo, CSSProperties } from 'react';
import { useTenant } from '@/hooks/useTenant';

interface TenantLayoutProps {
  children: ReactNode;
}

const DEFAULT_PRIMARY = '#FCD34D';

function hexToRgba(hex: string, alpha = 1) {
  const value = hex.replace('#', '');
  if (value.length !== 6) return `rgba(252, 211, 77, ${alpha})`;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function TenantLayout({ children }: TenantLayoutProps) {
  const { tenant, isLoading } = useTenant();

  const accentVariables = useMemo(() => {
    const color = tenant.primaryColor || DEFAULT_PRIMARY;
    return {
      '--tenant-primary': color,
      '--tenant-primary-hover': color,
      '--tenant-primary-active': color,
      '--tenant-primary-strong': color,
      '--tenant-primary-soft': hexToRgba(color, 0.15),
      '--tenant-primary-muted': hexToRgba(color, 0.22),
      '--tenant-primary-border': hexToRgba(color, 0.35),
      '--tenant-primary-ring': hexToRgba(color, 0.35),
      '--tenant-primary-foreground': '#1f1600'
    } as CSSProperties;
  }, [tenant.primaryColor]);

  return (
    <div 
      style={accentVariables}
    >
      {children}
    </div>
  );
}
