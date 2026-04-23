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
import { useEffect, useState } from 'react';

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
  const [processedLogoSrc, setProcessedLogoSrc] = useState<string | null>(null);
  const isDarkMode = resolvedTheme === 'dark';
  const activeLogo = isDarkMode && tenant.darkLogo ? tenant.darkLogo : tenant.logo;
  const logoPath = (activeLogo || '').split('?')[0].toLowerCase();
  const isSvgLogo = logoPath.endsWith('.svg');
  const applyMono = forceMonoOnDark && isDarkMode && !tenant.darkLogo && isSvgLogo;
  const blendOriginalNextideLogo =
    !isDarkMode &&
    logoPath.endsWith('/logo/nextidelogo.png');
  const stripWhiteBackground =
    !isDarkMode &&
    logoPath.endsWith('/logo/nextidelogo.png');

  useEffect(() => {
    if (!stripWhiteBackground || !activeLogo) {
      setProcessedLogoSrc(null);
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          if (!cancelled) setProcessedLogoSrc(activeLogo);
          return;
        }

        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];

          if (a === 0) continue;

          const min = Math.min(r, g, b);
          const max = Math.max(r, g, b);
          const nearWhite = min >= 232;
          const lowSaturation = max - min <= 16;

          if (nearWhite && lowSaturation) {
            if (min >= 246) {
              data[i + 3] = 0;
            } else {
              const fade = Math.max(0, (246 - min) / 14);
              data[i + 3] = Math.round(a * fade);
            }
          }
        }

        ctx.putImageData(imageData, 0, 0);
        const cleanedSrc = canvas.toDataURL('image/png');
        if (!cancelled) setProcessedLogoSrc(cleanedSrc);
      } catch {
        if (!cancelled) setProcessedLogoSrc(activeLogo);
      }
    };

    img.onerror = () => {
      if (!cancelled) setProcessedLogoSrc(activeLogo);
    };

    img.src = activeLogo;

    return () => {
      cancelled = true;
    };
  }, [stripWhiteBackground, activeLogo]);

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
    applyMono && "transition brightness-0 invert",
    blendOriginalNextideLogo && "mix-blend-multiply"
  );

  const content = activeLogo ? (
    <img 
      src={stripWhiteBackground ? (processedLogoSrc || activeLogo) : activeLogo}
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

  if (activeLogo && !showName) {
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
