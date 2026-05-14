import type { Prisma } from '@prisma/client';
import { badRequest } from './service';
import { parseJsonObject, safeTrim } from './normalize';

const PLUGIN_FEATURE_KEYS = new Set([
  'plugin_xhs_collect',
  'plugin_xhs_publish',
  'plugin_douyin_collect',
  'plugin_douyin_publish',
]);

export const PLUGIN_PLATFORMS = [
  { id: 'xhs', label: '小红书', aliases: ['xiaohongshu', 'rednote'] },
  { id: 'douyin', label: '抖音', aliases: ['tiktok-cn'] },
] as const;

export function normalizePluginPlatform(value: unknown) {
  const raw = safeTrim(value)?.toLowerCase();
  if (!raw) throw badRequest('Missing platform');

  const match = PLUGIN_PLATFORMS.find(
    platform => platform.id === raw || (platform.aliases as readonly string[]).includes(raw),
  );
  if (!match) throw badRequest('Unsupported platform');
  return match.id;
}

export function normalizePluginFeatureKey(value: unknown, platform: string, action: unknown) {
  const explicit = safeTrim(value);
  if (explicit) {
    if (!PLUGIN_FEATURE_KEYS.has(explicit)) throw badRequest('Unsupported plugin featureKey');
    return explicit;
  }

  const normalizedAction = safeTrim(action)?.toLowerCase();
  if (platform === 'xhs' && normalizedAction === 'publish') return 'plugin_xhs_publish';
  if (platform === 'douyin' && normalizedAction === 'publish') return 'plugin_douyin_publish';
  if (platform === 'douyin') return 'plugin_douyin_collect';
  return 'plugin_xhs_collect';
}

export function buildPluginAccountInput(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw badRequest('Invalid account item');
  }

  const item = raw as Record<string, unknown>;
  const platform = normalizePluginPlatform(item.platform);
  const platformUid = safeTrim(item.platformUid) || safeTrim(item.uid) || safeTrim(item.userId);
  if (!platformUid) throw badRequest('Missing platformUid');

  return {
    platform,
    platformUid,
    nickname: safeTrim(item.nickname) || safeTrim(item.name),
    avatarUrl: safeTrim(item.avatarUrl) || safeTrim(item.avatar),
    status: safeTrim(item.status) || 'usable',
    metadata: parseJsonObject(item.metadata),
  };
}

export function parsePluginAccounts(body: Record<string, unknown>) {
  const rawAccounts = Array.isArray(body.accounts)
    ? body.accounts
    : Array.isArray(body)
      ? body
      : body.account
        ? [body.account]
        : [];

  if (rawAccounts.length === 0) throw badRequest('Missing accounts');
  if (rawAccounts.length > 20) throw badRequest('Too many accounts');
  return rawAccounts.map(buildPluginAccountInput);
}

export function buildPluginEventInput(body: Record<string, unknown>): {
  eventType: string;
  platform: string | null;
  requestId: string | null;
  payload: Prisma.InputJsonObject;
  featureKey: string | null;
} {
  const eventType = safeTrim(body.eventType) || safeTrim(body.type) || 'plugin_event';
  const platform = body.platform ? normalizePluginPlatform(body.platform) : null;
  const payload = parseJsonObject(body.payload || body.evidence || body);
  const featureKey = platform
    ? normalizePluginFeatureKey(body.featureKey, platform, body.action || body.eventType || body.type)
    : safeTrim(body.featureKey);

  return {
    eventType,
    platform,
    requestId: safeTrim(body.requestId),
    payload,
    featureKey,
  };
}
