import { kv } from '@vercel/kv';

// Cache configuration
const CACHE_PREFIX = 'search-cache:';
const CACHE_TTL_SECONDS = 300; // 5 minutes

/**
 * A generic cache service using Vercel KV.
 */
export class CacheService {
  /**
   * Generates a cache key based on the search query.
   * @param query The search query string.
   * @returns A unique cache key.
   */
  private static getKey(query: string): string {
    // Simple hashing can be used here in the future if keys get too long.
    // For now, a simple prefix and the query are sufficient.
    return `${CACHE_PREFIX}${query.toLowerCase().trim()}`;
  }

  /**
   * Retrieves a value from the cache.
   * @param query The search query used as the key.
   * @returns The cached value, or null if not found.
   */
  static async get<T>(query: string): Promise<T | null> {
    try {
      const key = this.getKey(query);
      const value = await kv.get<T>(key);
      console.log(`[Cache] GET for key "${key}": ${value ? 'HIT' : 'MISS'}`);
      return value;
    } catch (error) {
      console.error('[Cache] Error getting value from Vercel KV:', error);
      return null; // On error, bypass cache
    }
  }

  /**
   * Stores a value in the cache with a predefined TTL.
   * @param query The search query used as the key.
   * @param value The value to store.
   */
  static async set<T>(query: string, value: T): Promise<void> {
    try {
      const key = this.getKey(query);
      await kv.set(key, value, { ex: CACHE_TTL_SECONDS });
      console.log(`[Cache] SET for key "${key}" with TTL ${CACHE_TTL_SECONDS}s`);
    } catch (error) {
      console.error('[Cache] Error setting value in Vercel KV:', error);
    }
  }
} 