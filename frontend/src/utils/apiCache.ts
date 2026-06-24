/**
 * Simple in-memory API response cache with TTL.
 * Prevents redundant fetch calls within a time window.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class ApiCache {
  private store = new Map<string, CacheEntry<any>>();
  private defaultTtl = 5000; // 5 seconds default

  /**
   * Get a cached response, or null if expired/missing.
   */
  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data as T;
  }

  /**
   * Store a response in cache.
   */
  set<T>(key: string, data: T, ttlMs?: number): void {
    this.store.set(key, {
      data,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtl),
    });
  }

  /**
   * Invalidate a specific key.
   */
  delete(key: string): void {
    this.store.delete(key);
  }

  /**
   * Invalidate keys matching a prefix.
   */
  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Clear entire cache.
   */
  clear(): void {
    this.store.clear();
  }
}

export const apiCache = new ApiCache();

/**
 * Cached fetch wrapper. Returns cached data if within TTL,
 * otherwise performs a real fetch and caches the result.
 */
export async function cachedFetch<T>(
  url: string,
  options?: RequestInit,
  ttlMs?: number,
): Promise<T> {
  const cacheKey = `${options?.method || 'GET'}:${url}`;

  // Only cache GET requests
  if (!options?.method || options.method === 'GET') {
    const cached = apiCache.get<T>(cacheKey);
    if (cached !== null) return cached;
  }

  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const data = (await res.json()) as T;

  // Cache GET responses
  if (!options?.method || options.method === 'GET') {
    apiCache.set(cacheKey, data, ttlMs);
  }

  return data;
}

/**
 * Invalidate cache entries for mutating operations.
 */
export function invalidateCache(patterns: string[]): void {
  for (const pattern of patterns) {
    apiCache.invalidatePrefix(`GET:${pattern}`);
  }
}
