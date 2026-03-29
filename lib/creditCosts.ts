import prisma from "@/lib/prisma";

const CACHE_TTL_MS = 60_000; // 60 秒

interface CacheEntry {
  configs: Map<string, number>;
  loadedAt: number;
}

let cache: CacheEntry | null = null;

async function loadCache(): Promise<Map<string, number>> {
  const rows = await prisma.creditConfig.findMany({
    where: { enabled: true },
    select: { featureKey: true, amount: true },
  });
  return new Map(rows.map((r) => [r.featureKey, r.amount]));
}

/**
 * 获取指定功能的积分费用。
 * 从数据库加载并缓存 60 秒，admin 修改后会立即失效。
 *
 * @param featureKey 功能标识，如 "canvas_image:nano-banana-pro"、"storyboard_split"
 * @param defaultAmount 数据库中不存在时的默认值
 */
export async function getCreditCost(
  featureKey: string,
  defaultAmount = 1
): Promise<number> {
  const now = Date.now();
  if (!cache || now - cache.loadedAt > CACHE_TTL_MS) {
    const configs = await loadCache();
    cache = { configs, loadedAt: now };
  }
  return cache.configs.get(featureKey) ?? defaultAmount;
}

/**
 * 立即使缓存失效，下次请求将重新从数据库读取。
 * 在 admin PATCH 接口中调用。
 */
export function invalidateCreditCostCache(): void {
  cache = null;
}
