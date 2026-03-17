'use client';

import { useEffect } from 'react';

const SIDEBAR_STORAGE_KEY = 'sidebar-collapsed';

function dispatchSidebarState(collapsed: boolean) {
  window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
  window.dispatchEvent(new CustomEvent('sidebar:external-toggle', { detail: { collapsed } }));
}

export function useSidebarAutoCollapse(enabled = true, targetState = true) {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      return;
    }

    const previousValue = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    const previousCollapsed = previousValue === null ? undefined : previousValue === 'true';

    if (previousCollapsed !== targetState) {
      dispatchSidebarState(targetState);
    }

    return () => {
      if (previousCollapsed === undefined) return;
      dispatchSidebarState(previousCollapsed);
    };
  }, [enabled, targetState]);
}
