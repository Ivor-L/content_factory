const MAIN_URL = process.env.NEXAPI_ROUTE_MAIN?.trim() || 'https://aiapi.atomx.top';
const BACKUP_URL = process.env.NEXAPI_ROUTE_BACKUP?.trim() || MAIN_URL;

const DEFAULT_ROUTES = [
  { id: 'nextide-main', label: 'NexAPI 主站', baseUrl: MAIN_URL, origin: 'global' },
  { id: 'nextide-backup', label: 'NexAPI 备用', baseUrl: BACKUP_URL, origin: 'global' },
];

function parseExtraRoutes(): RouteConfig[] {
  const raw = process.env.NEXAPI_EXTRA_ROUTES?.trim();
  if (!raw) return [];

  return raw
    .split(',')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((entry, index) => {
      const [id, label, baseUrl, origin] = entry.split('|').map((value) => value?.trim());
      if (!id || !label || !baseUrl) {
        throw new Error(
          `Invalid NEXAPI_EXTRA_ROUTES entry at index ${index}. Expected "id|label|url|origin".`
        );
      }
      return {
        id,
        label,
        baseUrl: baseUrl.replace(/\/$/, ''),
        origin: origin || 'custom',
      } as RouteConfig;
    });
}

export type RouteConfig = (typeof DEFAULT_ROUTES)[number];

export type RouteHealth = RouteConfig & {
  healthy: boolean;
  latencyMs: number | null;
  checkedAt: number;
  error?: string;
};

const DEFAULT_TIMEOUT_MS = 3_000;

export function listRouteConfigs(): RouteConfig[] {
  return [...DEFAULT_ROUTES, ...parseExtraRoutes()];
}

export async function checkRouteHealth(route: RouteConfig): Promise<RouteHealth> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const start = Date.now();

  try {
    const res = await fetch(route.baseUrl, {
      method: 'HEAD',
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);

    return {
      ...route,
      healthy: res.ok,
      latencyMs: Date.now() - start,
      checkedAt: Date.now(),
      error: res.ok ? undefined : `status:${res.status}`,
    };
  } catch (error: any) {
    clearTimeout(timer);
    return {
      ...route,
      healthy: false,
      latencyMs: null,
      checkedAt: Date.now(),
      error: error?.message ?? 'unknown error',
    };
  }
}
