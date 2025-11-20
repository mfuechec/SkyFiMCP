// Simple in-memory cache for OSM API responses
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

export class OSMCache {
  private cache: Map<string, CacheEntry<any>>;
  private defaultTTL: number;

  constructor(defaultTTLMs: number = 24 * 60 * 60 * 1000) {
    // 24 hours default
    this.cache = new Map();
    this.defaultTTL = defaultTTLMs;
  }

  /**
   * Generate cache key from parameters
   */
  private generateKey(prefix: string, params: Record<string, any>): string {
    const sortedParams = Object.keys(params)
      .sort()
      .map((key) => `${key}:${JSON.stringify(params[key])}`)
      .join('|');
    return `${prefix}:${sortedParams}`;
  }

  /**
   * Get cached value if not expired
   */
  get<T>(prefix: string, params: Record<string, any>): T | null {
    const key = this.generateKey(prefix, params);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Set cached value
   */
  set<T>(
    prefix: string,
    params: Record<string, any>,
    data: T,
    ttlMs?: number
  ): void {
    const key = this.generateKey(prefix, params);
    const timestamp = Date.now();
    const expiresAt = timestamp + (ttlMs || this.defaultTTL);

    this.cache.set(key, {
      data,
      timestamp,
      expiresAt,
    });
  }

  /**
   * Clear all expired entries
   */
  clearExpired(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach((key) => this.cache.delete(key));
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    expired: number;
    valid: number;
  } {
    const now = Date.now();
    let expired = 0;
    let valid = 0;

    for (const entry of this.cache.values()) {
      if (now > entry.expiresAt) {
        expired++;
      } else {
        valid++;
      }
    }

    return {
      size: this.cache.size,
      expired,
      valid,
    };
  }
}

// Export singleton instance
export const osmCache = new OSMCache();
