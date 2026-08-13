type PublicDataCacheEntry<T> = {
  expiresAt: number;
  hasValue: boolean;
  value?: T;
  pending?: Promise<T>;
};

const publicDataCache = new Map<string, PublicDataCacheEntry<unknown>>();

export const PUBLIC_DATA_CACHE_TTL_MS = 15_000;
const PUBLIC_DATA_CACHE_MAX_ENTRIES = 512;

function trimPublicDataCache(now: number) {
  for (const [key, entry] of publicDataCache) {
    if (!entry.pending && entry.expiresAt <= now) publicDataCache.delete(key);
  }

  while (publicDataCache.size > PUBLIC_DATA_CACHE_MAX_ENTRIES) {
    const oldestKey = publicDataCache.keys().next().value;
    if (!oldestKey) break;
    publicDataCache.delete(oldestKey);
  }
}

export async function getCachedPublicData<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs = PUBLIC_DATA_CACHE_TTL_MS,
): Promise<T> {
  const normalizedKey = String(key || '').trim();
  const normalizedTtl = Math.max(0, Number(ttlMs) || 0);
  if (!normalizedKey || normalizedTtl === 0) return loader();

  const now = Date.now();
  const cached = publicDataCache.get(normalizedKey) as PublicDataCacheEntry<T> | undefined;
  if (cached?.pending) return cached.pending;
  if (cached?.hasValue && cached.expiresAt > now) return cached.value as T;

  const pending = Promise.resolve().then(loader);
  publicDataCache.set(normalizedKey, { expiresAt: 0, hasValue: false, pending });

  try {
    const value = await pending;
    publicDataCache.set(normalizedKey, {
      expiresAt: Date.now() + normalizedTtl,
      hasValue: true,
      value,
    });
    trimPublicDataCache(Date.now());
    return value;
  } catch (error) {
    const current = publicDataCache.get(normalizedKey) as PublicDataCacheEntry<T> | undefined;
    if (current?.pending === pending) publicDataCache.delete(normalizedKey);
    throw error;
  }
}

export function clearPublicDataCache(prefix = '') {
  const normalizedPrefix = String(prefix || '');
  if (!normalizedPrefix) {
    publicDataCache.clear();
    return;
  }

  for (const key of publicDataCache.keys()) {
    if (key.startsWith(normalizedPrefix)) publicDataCache.delete(key);
  }
}
