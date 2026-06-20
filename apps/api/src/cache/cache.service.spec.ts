import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Redis } from 'ioredis';
import { CacheService } from './cache.service';

/** Minimal stub of the ioredis methods CacheService touches. */
function createMockRedis() {
  return {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    scan: vi.fn(),
  };
}

describe('CacheService', () => {
  let redis: ReturnType<typeof createMockRedis>;
  let cache: CacheService;

  beforeEach(() => {
    redis = createMockRedis();
    cache = new CacheService(redis as unknown as Redis);
  });

  describe('get', () => {
    it('returns the parsed value on a hit', async () => {
      redis.get.mockResolvedValue(JSON.stringify({ a: 1 }));

      await expect(cache.get('k')).resolves.toEqual({ a: 1 });
      expect(redis.get).toHaveBeenCalledWith('k');
    });

    it('returns null on a miss', async () => {
      redis.get.mockResolvedValue(null);

      await expect(cache.get('k')).resolves.toBeNull();
    });

    it('returns null (degrades) when Redis errors', async () => {
      redis.get.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(cache.get('k')).resolves.toBeNull();
    });
  });

  describe('set', () => {
    it('stores the JSON-encoded value with an EX ttl', async () => {
      await cache.set('k', { a: 1 }, 30);

      expect(redis.set).toHaveBeenCalledWith('k', JSON.stringify({ a: 1 }), 'EX', 30);
    });

    it('swallows Redis errors (degrades)', async () => {
      redis.set.mockRejectedValue(new Error('down'));

      await expect(cache.set('k', 1, 30)).resolves.toBeUndefined();
    });
  });

  describe('del', () => {
    it('deletes the given keys', async () => {
      await cache.del('a', 'b');

      expect(redis.del).toHaveBeenCalledWith('a', 'b');
    });

    it('is a no-op when given no keys', async () => {
      await cache.del();

      expect(redis.del).not.toHaveBeenCalled();
    });
  });

  describe('delByPattern', () => {
    it('SCANs to completion and deletes every matched key', async () => {
      redis.scan
        .mockResolvedValueOnce(['10', ['claims:list:a', 'claims:list:b']])
        .mockResolvedValueOnce(['0', ['claims:list:c']]);

      await cache.delByPattern('claims:list:*');

      expect(redis.scan).toHaveBeenNthCalledWith(1, '0', 'MATCH', 'claims:list:*', 'COUNT', 100);
      expect(redis.scan).toHaveBeenNthCalledWith(2, '10', 'MATCH', 'claims:list:*', 'COUNT', 100);
      expect(redis.del).toHaveBeenCalledWith('claims:list:a', 'claims:list:b');
      expect(redis.del).toHaveBeenCalledWith('claims:list:c');
    });

    it('does not call del when a scan page is empty', async () => {
      redis.scan.mockResolvedValueOnce(['0', []]);

      await cache.delByPattern('claims:list:*');

      expect(redis.del).not.toHaveBeenCalled();
    });

    it('swallows Redis errors (degrades)', async () => {
      redis.scan.mockRejectedValue(new Error('down'));

      await expect(cache.delByPattern('x:*')).resolves.toBeUndefined();
    });
  });

  describe('wrap', () => {
    it('returns the cached value without calling the factory on a hit', async () => {
      redis.get.mockResolvedValue(JSON.stringify(['cached']));
      const factory = vi.fn();

      await expect(cache.wrap('k', 30, factory)).resolves.toEqual(['cached']);
      expect(factory).not.toHaveBeenCalled();
    });

    it('calls the factory and caches its result on a miss', async () => {
      redis.get.mockResolvedValue(null);
      const factory = vi.fn().mockResolvedValue(['fresh']);

      await expect(cache.wrap('k', 30, factory)).resolves.toEqual(['fresh']);
      expect(factory).toHaveBeenCalledOnce();
      expect(redis.set).toHaveBeenCalledWith('k', JSON.stringify(['fresh']), 'EX', 30);
    });
  });
});
