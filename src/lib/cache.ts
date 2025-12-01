import { kv } from '@vercel/kv';

// Cache TTL configurations (in seconds)
export const CACHE_TTL = {
  SEARCH: 300,           // 5 minutes - for search results
  CUSTOMER: 1800,        // 30 minutes - customer data changes infrequently
  PRODUCT: 3600,         // 1 hour - product catalog
  ORDER_STATUS: 300,     // 5 minutes - order status (balance freshness vs load)
  USER_SESSION: 86400,   // 24 hours - user preferences
  SHIPPING_RATES: 900,   // 15 minutes - shipping rate calculations
} as const;

// Cache key prefixes
const PREFIXES = {
  SEARCH: 'search:',
  CUSTOMER: 'customer:',
  PRODUCT: 'product:',
  ORDER: 'order:',
  USER: 'user:',
  SHIPPING: 'shipping:',
} as const;

type CacheCategory = keyof typeof PREFIXES;

/**
 * Enhanced cache service using Vercel KV with category-based TTLs.
 */
export class CacheService {
  /**
   * Generates a namespaced cache key.
   */
  private static getKey(category: CacheCategory, identifier: string): string {
    return `${PREFIXES[category]}${identifier.toLowerCase().trim()}`;
  }

  /**
   * Gets the TTL for a category.
   */
  private static getTTL(category: CacheCategory): number {
    const ttlMap: Record<CacheCategory, number> = {
      SEARCH: CACHE_TTL.SEARCH,
      CUSTOMER: CACHE_TTL.CUSTOMER,
      PRODUCT: CACHE_TTL.PRODUCT,
      ORDER: CACHE_TTL.ORDER_STATUS,
      USER: CACHE_TTL.USER_SESSION,
      SHIPPING: CACHE_TTL.SHIPPING_RATES,
    };
    return ttlMap[category];
  }

  /**
   * Retrieves a value from the cache.
   */
  static async get<T>(category: CacheCategory, identifier: string): Promise<T | null> {
    try {
      const key = this.getKey(category, identifier);
      const value = await kv.get<T>(key);
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Cache] ${category}:${identifier} ${value ? 'HIT' : 'MISS'}`);
      }
      return value;
    } catch (error) {
      console.error('[Cache] GET error:', error);
      return null;
    }
  }

  /**
   * Stores a value in the cache with category-based TTL.
   */
  static async set<T>(category: CacheCategory, identifier: string, value: T, customTTL?: number): Promise<void> {
    try {
      const key = this.getKey(category, identifier);
      const ttl = customTTL ?? this.getTTL(category);
      await kv.set(key, value, { ex: ttl });
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Cache] SET ${category}:${identifier} TTL=${ttl}s`);
      }
    } catch (error) {
      console.error('[Cache] SET error:', error);
    }
  }

  /**
   * Deletes a value from the cache.
   */
  static async delete(category: CacheCategory, identifier: string): Promise<void> {
    try {
      const key = this.getKey(category, identifier);
      await kv.del(key);
    } catch (error) {
      console.error('[Cache] DELETE error:', error);
    }
  }

  /**
   * Invalidates all cache entries matching a pattern.
   */
  static async invalidatePattern(category: CacheCategory, pattern: string): Promise<void> {
    try {
      const keys = await kv.keys(`${PREFIXES[category]}${pattern}*`);
      if (keys.length > 0) {
        await kv.del(...keys);
        console.log(`[Cache] Invalidated ${keys.length} keys matching ${category}:${pattern}*`);
      }
    } catch (error) {
      console.error('[Cache] INVALIDATE error:', error);
    }
  }

  /**
   * Get or set pattern - fetch from cache or execute function and cache result.
   */
  static async getOrSet<T>(
    category: CacheCategory,
    identifier: string,
    fetchFn: () => Promise<T>,
    customTTL?: number
  ): Promise<T> {
    const cached = await this.get<T>(category, identifier);
    if (cached !== null) {
      return cached;
    }

    const value = await fetchFn();
    await this.set(category, identifier, value, customTTL);
    return value;
  }

  // Legacy methods for backward compatibility
  /** @deprecated Use get('SEARCH', query) instead */
  static async getSearch<T>(query: string): Promise<T | null> {
    return this.get<T>('SEARCH', query);
  }

  /** @deprecated Use set('SEARCH', query, value) instead */
  static async setSearch<T>(query: string, value: T): Promise<void> {
    return this.set('SEARCH', query, value);
  }
} 