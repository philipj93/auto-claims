import { Global, Module } from '@nestjs/common';
import { CacheService } from './cache.service';

/**
 * Exposes the cache-aside helper app-wide. RedisModule is already @Global, so
 * the REDIS_CLIENT token CacheService depends on is available without importing
 * anything here.
 */
@Global()
@Module({
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
