/**
 * 动态租户 Logo 组件
 * 
 * 根据当前租户配置显示不同的 Logo
 */

'use client';

import { useTenant } from '@/hooks/useTenant';
import { cn } from '@/lib/utils';
import { Sparkles } from 'lucide-react';

interface TenantLogoProps {
  className?: string;
  showName?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function TenantLogo({ 
  className, 
  showName = true,
  size = 'md' 
}: TenantLogoProps) {
  const { tenant, isLoading } = useTenant();

  if (isLoading) {
    return (
      <div className={cn("animate-pulse bg-gray-200 rounded", className)}>
        <div className="w-20 h-8" />
      </div>
    );
  }

  const sizeMap = {
    sm: 120,
    md: 160,
    lg: 200,
  } as const;

  const sizeClasses = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-lg",
  } as const;

  const content = tenant.logo ? (
    <img 
      src={tenant.logo} 
      alt={tenant.name}
      className="object-contain"
      style={{
        height: sizeMap[size],
        width: 'auto',
        objectFit: 'contain'
      }}
    />
  ) : (
    <div className="flex items-center gap-2">
      <div 
        className="flex items-center justify-center rounded-lg"
        style={{ 
          backgroundColor: tenant.primaryColor || '#007AFF',
          width: sizeMap[size],
          height: sizeMap[size],
        }}
      >
        <Sparkles className="text-white" size={size === 'sm' ? 12 : size === 'md' ? 16 : 20} />
      </div>
      {showName && (
        <span 
          className={cn("font-bold", sizeClasses[size])}
          style={{ color: tenant.primaryColor || '#007AFF' }}
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
