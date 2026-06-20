import { Inject, Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';

/**
 * Thin cache-aside helper over the shared ioredis client (the same connection
 * the throttler uses — no second connection). Every method is fail-soft: a
 * Redis outage degrades to a cache miss / no-op so requests still fall through
 * to Postgres, mirroring the health check's tolerance of a degraded Redis.
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  /**
   * In-flight factory calls, keyed by cache key. Coalesces concurrent misses in
   * this process so a cold key triggers one DB call, not one per request
   * (single-flight). Cross-process stampede (multiple instances) is unhandled —
   * acceptable at this scale; revisit with a distributed lock if it isn't.
   */
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key);
      return raw === null ? null : (JSON.parse(raw) as T);
    } catch (err) {
      this.logger.warn(`cache get failed for ${key}: ${String(err)}`);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
      this.logger.warn(`cache set failed for ${key}: ${String(err)}`);
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
      await this.redis.del(...keys);
    } catch (err) {
      this.logger.warn(`cache del failed: ${String(err)}`);
    }
  }

  /**
   * Delete every key matching a glob pattern. Uses a non-blocking SCAN cursor
   * (never KEYS) so invalidation stays safe on a large keyspace.
   *
   * SCAN still walks the whole (shared) keyspace and filters by MATCH, so each
   * call is O(total keys). Fine at this scale; if list writes ever get hot,
   * switch to a tagged key-set per namespace (SADD on write, read the set to
   * delete) so invalidation is O(keys in namespace) instead.
   */
  async delByPattern(pattern: string): Promise<void> {
    try {
      let cursor = '0';
      do {
        const [next, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = next;
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      } while (cursor !== '0');
    } catch (err) {
      this.logger.warn(`cache delByPattern failed for ${pattern}: ${String(err)}`);
    }
  }

  /**
   * Cache-aside: return the cached value, or compute it via `factory`, cache it,
   * and return it. Concurrent misses on the same key share one `factory` run.
   *
   * A `factory` rejection propagates (a backing-store failure must surface, not
   * degrade to a miss) and is NOT cached. Note the value round-trips through
   * JSON, so a cache hit returns a plain object — `Date`s come back as ISO
   * strings and the result is not a class instance. Fine for values serialized
   * straight to an HTTP JSON response; don't rely on entity methods/`instanceof`
   * or `@Exclude`-based serialization downstream of a cached read.
   */
  async wrap<T>(key: string, ttlSeconds: number, factory: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const existing = this.inflight.get(key);
    if (existing) {
      return existing as Promise<T>;
    }

    const pending = (async () => {
      try {
        const value = await factory();
        await this.set(key, value, ttlSeconds);
        return value;
      } finally {
        // Always clear the slot — including on rejection — so a failed flight
        // never blocks later retries.
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, pending);
    return pending as Promise<T>;
  }
}
