import { Global, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

/**
 * Owns the single shared Redis connection. `client` is reused by the throttler
 * storage; `ping()` backs the health check. The connection is created eagerly
 * from REDIS_URL (default redis://localhost:6379) and closed on shutdown.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(config: ConfigService) {
    this.client = new Redis(config.get<string>('REDIS_URL', 'redis://localhost:6379'), {
      maxRetriesPerRequest: null,
    });
  }

  ping(): Promise<string> {
    return this.client.ping();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit().catch(() => undefined);
  }
}

@Global()
@Module({
  providers: [
    RedisService,
    { provide: REDIS_CLIENT, useFactory: (s: RedisService) => s.client, inject: [RedisService] },
  ],
  exports: [RedisService, REDIS_CLIENT],
})
export class RedisModule {}
