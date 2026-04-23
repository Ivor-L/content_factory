'use client';

import { useEffect } from 'react';
import { useTenant } from '@/hooks/useTenant';

const DEFAULT_FAVICON = '/favicon-whale.svg';
const DEFAULT_TITLE = 'NexTide';

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

function updateDocumentTitle(title?: string | null) {
  if (typeof document === 'undefined') return;

  const normalizedTitle = (title ?? '').trim() || DEFAULT_TITLE;
  if (document.title !== normalizedTitle) {
    document.title = normalizedTitle;
  }
}

export function TenantBrandingEffect() {
  const { tenant } = useTenant();

  useEffect(() => {
    const targetHref = tenant.faviconLogo || tenant.browserLogo || DEFAULT_FAVICON;

    updateFavicon(targetHref);
  }, [tenant.faviconLogo, tenant.browserLogo]);

  useEffect(() => {
    updateDocumentTitle(tenant.name);
  }, [tenant.name]);

  return null;
}
