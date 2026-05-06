type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const MAX_ENTRIES = 1000;
const caches = new Map<string, Map<string, CacheEntry<unknown>>>();

function getCache(namespace: string) {
  let cache = caches.get(namespace);
  if (!cache) {
    cache = new Map<string, CacheEntry<unknown>>();
    caches.set(namespace, cache);
  }
  return cache;
}

export function getShortTtlCache<T>(namespace: string, key: string): T | null {
  const cache = getCache(namespace);
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

export function setShortTtlCache<T>(
  namespace: string,
  key: string,
  value: T,
  ttlMs: number,
) {
  const cache = getCache(namespace);
  cache.delete(key);
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });

  if (cache.size <= MAX_ENTRIES) return;

  const now = Date.now();
  for (const [cacheKey, cacheValue] of cache) {
    if (cacheValue.expiresAt <= now) {
      cache.delete(cacheKey);
    }
  }
  while (cache.size > MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}

export function deleteShortTtlCache(namespace: string, predicate?: (key: string) => boolean) {
  const cache = caches.get(namespace);
  if (!cache) return;
  if (!predicate) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (predicate(key)) cache.delete(key);
  }
}
