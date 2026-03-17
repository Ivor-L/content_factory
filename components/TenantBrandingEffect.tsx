'use client';

import { useEffect } from 'react';
import { useTenant } from '@/hooks/useTenant';

const DEFAULT_FAVICON = '/favicon-whale.svg';

function updateFavicon(href: string) {
  if (typeof document === 'undefined') return;

  const normalizedHref = new URL(href, window.location.origin).href;
  const existing =
    (document.querySelector("link[data-tenant-favicon='true']") as HTMLLinkElement | null) ??
    (document.querySelector("link[rel='icon']") as HTMLLinkElement | null);

  if (existing) {
    if (existing.href !== normalizedHref) {
      existing.href = normalizedHref;
    }
    existing.setAttribute('rel', 'icon');
    existing.setAttribute('data-tenant-favicon', 'true');
    return;
  }

  const link = document.createElement('link');
  link.rel = 'icon';
  link.href = normalizedHref;
  link.setAttribute('data-tenant-favicon', 'true');
  document.head.appendChild(link);
}

export function TenantBrandingEffect() {
  const { tenant, tenantSlug } = useTenant();

  useEffect(() => {
    const targetHref = tenantSlug === 'jubaopen' && tenant.browserLogo
      ? tenant.browserLogo
      : DEFAULT_FAVICON;

    updateFavicon(targetHref);
  }, [tenant.browserLogo, tenantSlug]);

  return null;
}
