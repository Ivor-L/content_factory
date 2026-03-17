'use client';

import { useEffect } from 'react';

const STORAGE_KEY = 'atomx:chunk-reload-ts';
const RELOAD_COOLDOWN_MS = 10000;

function isChunkLoadError(input: unknown): boolean {
  if (!input) return false;

  if (typeof input === 'string') {
    return /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module/i.test(input);
  }

  if (input instanceof Error) {
    if (input.name === 'ChunkLoadError') return true;
    return /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module/i.test(
      input.message ?? ''
    );
  }

  if (typeof input === 'object') {
    const maybe = input as { name?: string; message?: string };
    if (typeof maybe.name === 'string' && maybe.name.includes('ChunkLoadError')) {
      return true;
    }
    if (
      typeof maybe.message === 'string' &&
      /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module/i.test(maybe.message)
    ) {
      return true;
    }
  }

  return false;
}

function scheduleReload(trigger: string) {
  try {
    const now = Date.now();
    const lastReloadAt = Number(sessionStorage.getItem(STORAGE_KEY) ?? '0');
    if (!lastReloadAt || now - lastReloadAt > RELOAD_COOLDOWN_MS) {
      sessionStorage.setItem(STORAGE_KEY, String(now));
      console.warn(`[ChunkLoadRecovery] ${trigger} detected chunk failure. Reloading to recover.`);
      window.location.reload();
      return;
    }

    sessionStorage.removeItem(STORAGE_KEY);
    console.error('[ChunkLoadRecovery] Chunk failure persisted after automatic reload.');
  } catch (error) {
    console.error('[ChunkLoadRecovery] Failed to record reload attempt:', error);
    window.location.reload();
  }
}

export function ChunkLoadRecovery() {
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isChunkLoadError(event.reason)) {
        event.preventDefault?.();
        scheduleReload('unhandledrejection');
      }
    };

    const handleError = (event: ErrorEvent) => {
      const source = event.error ?? event.message;
      if (isChunkLoadError(source)) {
        event.preventDefault?.();
        scheduleReload('error');
      }
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleError);

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleError);
    };
  }, []);

  return null;
}
