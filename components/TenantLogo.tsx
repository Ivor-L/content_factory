/**
 * 动态租户 Logo 组件
 * 
 * 根据当前租户配置显示不同的 Logo
 */
'use client';

/* eslint-disable @next/next/no-img-element -- Tenant logos are admin-uploaded URLs with unknown hosts */

import { useTenant } from '@/hooks/useTenant';
import { cn } from '@/lib/utils';
import { Sparkles } from 'lucide-react';
import { useTheme } from 'next-themes';

interface TenantLogoProps {
  className?: string;
  showName?: boolean;
  size?: 'sm' | 'md' | 'lg';
  forceMonoOnDark?: boolean;
}

const SIZE_MAP: Record<'sm' | 'md' | 'lg', number> = {
  sm: 120,
  md: 160,
  lg: 200,
};

const SIZE_CLASSES: Record<'sm' | 'md' | 'lg', string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-lg",
};

const FALLBACK_PRIMARY_COLOR = '#007AFF';

export function TenantLogo({ 
  className, 
  showName = true,
  size = 'md',
  forceMonoOnDark = false
}: TenantLogoProps) {
  const { tenant, isLoading } = useTenant();
  const { resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === 'dark';
  const applyMono = forceMonoOnDark && isDarkMode;

  if (isLoading) {
    return (
      <div className={cn("animate-pulse bg-gray-200 rounded", className)}>
        <div className="w-20 h-8" />
      </div>
    );
  }

  const resolvedPrimaryColor = tenant.primaryColor || FALLBACK_PRIMARY_COLOR;

  const imageClass = cn(
    "object-contain",
    applyMono && "transition brightness-0 invert"
  );

  const content = tenant.logo ? (
    <img 
      src={tenant.logo} 
      alt={tenant.name}
      className={imageClass}
      style={{
        height: SIZE_MAP[size],
        width: 'auto',
        objectFit: 'contain'
      }}
    />
  ) : (
    <div className="flex items-center gap-2">
      <div 
        className="flex items-center justify-center rounded-lg"
        style={{ 
          backgroundColor: resolvedPrimaryColor,
          width: SIZE_MAP[size],
          height: SIZE_MAP[size],
        }}
      >
        <Sparkles className="text-white" size={size === 'sm' ? 12 : size === 'md' ? 16 : 20} />
      </div>
      {showName && (
        <span 
          className={cn("font-bold", SIZE_CLASSES[size])}
          style={{ color: applyMono ? '#FFFFFF' : resolvedPrimaryColor }}
        >
          {tenant.name}
        </span>
      )}
    </div>
  );

  if (tenant.logo && !showName) {
    return <div className={cn("flex items-start justify-start", className)}>{content}</div>;
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {content}
    </div>
  );
}

/**
 * 简单的租户 Icon（用于侧边栏）
 */
export function TenantIcon({ className }: { className?: string }) {
  const { tenant } = useTenant();

  return (
    <div 
      className={cn("flex items-center justify-center rounded-lg", className)}
      style={{ 
        backgroundColor: tenant.primaryColor || '#007AFF',
      }}
    >
      <Sparkles className="text-white" size={16} />
    </div>
  );
}
