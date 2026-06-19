import { describe, expect, it } from 'vitest';
import { HealthController } from './health.controller';
import type { RedisService } from './redis/redis.module';

const redisStub = (ping: () => Promise<string>): RedisService =>
  ({ ping }) as unknown as RedisService;

describe('HealthController', () => {
  it('reports ok with an ISO timestamp when Redis responds', async () => {
    const before = Date.now();
    const result = await new HealthController(redisStub(async () => 'PONG')).check();

    expect(result.status).toBe('ok');
    expect(result.redis).toBe('ok');
    const ts = Date.parse(result.timestamp);
    expect(Number.isNaN(ts)).toBe(false);
    expect(ts).toBeGreaterThanOrEqual(before - 1000);
  });

  it('reports degraded when the Redis ping fails', async () => {
    const result = await new HealthController(
      redisStub(() => Promise.reject(new Error('ECONNREFUSED'))),
    ).check();

    expect(result.status).toBe('degraded');
    expect(result.redis).toBe('down');
  });

  it('reports degraded when Redis replies with an unexpected value', async () => {
    const result = await new HealthController(redisStub(async () => 'WEIRD')).check();

    expect(result.status).toBe('degraded');
    expect(result.redis).toBe('degraded');
  });
});
