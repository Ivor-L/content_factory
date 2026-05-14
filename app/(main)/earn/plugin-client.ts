'use client';

export type ContentFactoryPluginStatus = {
  installed?: boolean;
  ready?: boolean;
  version?: string;
  permissions?: string[];
  apiBaseUrl?: string;
};

export type PluginPublishInput = {
  platform: string;
  title?: string;
  description?: string;
  tags?: string[];
  mediaUrls?: string[];
  taskId?: string;
  userTaskId?: string;
  material?: unknown;
  url?: string;
};

export type PluginEvidenceInput = {
  platform: string;
  userTaskId?: string;
  taskId?: string;
  submissionUrl?: string;
  action?: string;
  eventType?: string;
};

type ContentFactoryPluginAPI = {
  version: string;
  getStatus(): Promise<ContentFactoryPluginStatus>;
  checkPermission(): Promise<ContentFactoryPluginStatus>;
  login(platform: string): Promise<unknown>;
  getEarnTasks(): Promise<unknown[]>;
  publish(params: PluginPublishInput): Promise<unknown>;
  collectCurrentPage(params?: Record<string, unknown>): Promise<unknown>;
  captureEvidence(params?: PluginEvidenceInput): Promise<unknown>;
  syncAccounts(accounts?: unknown): Promise<unknown>;
};

declare global {
  interface Window {
    ContentFactoryPlugin?: ContentFactoryPluginAPI;
  }
}

export function getContentFactoryPlugin() {
  if (typeof window === 'undefined') return null;
  return window.ContentFactoryPlugin || null;
}

export async function waitForContentFactoryPlugin(timeoutMs = 1500) {
  const existing = getContentFactoryPlugin();
  if (existing) return existing;

  if (typeof window === 'undefined') return null;

  return new Promise<ContentFactoryPluginAPI | null>((resolve) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener('ContentFactoryPluginReady', onReady);
      resolve(getContentFactoryPlugin());
    }, timeoutMs);

    function onReady() {
      window.clearTimeout(timer);
      window.removeEventListener('ContentFactoryPluginReady', onReady);
      resolve(getContentFactoryPlugin());
    }

    window.addEventListener('ContentFactoryPluginReady', onReady);
  });
}

export function extractMaterialPublishDraft(materialPayload: unknown) {
  const payload = materialPayload && typeof materialPayload === 'object' && !Array.isArray(materialPayload)
    ? materialPayload as Record<string, unknown>
    : {};
  const title = pickString(payload.title || payload.name || payload.heading);
  const description = pickString(payload.description || payload.content || payload.body || payload.text || payload.copy);
  const tags = pickStringArray(payload.tags || payload.topics || payload.hashtags);
  const mediaUrls = pickStringArray(payload.mediaUrls || payload.images || payload.imageUrls || payload.videos || payload.videoUrls);

  return { title, description, tags, mediaUrls };
}

function pickString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function pickStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(item => pickString(item)).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(/[\n,，]+/).map(item => item.trim()).filter(Boolean);
  }
  return [];
}
