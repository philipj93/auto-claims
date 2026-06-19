import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/decorators/public.decorator';
import { RedisService } from './redis/redis.module';

@Controller('health')
export class HealthController {
  constructor(private readonly redis: RedisService) {}

  /** GET /api/health — liveness, including a Redis ping. */
  @Public()
  @Get()
  async check() {
    let redis: string;
    try {
      redis = (await this.redis.ping()) === 'PONG' ? 'ok' : 'degraded';
    } catch {
      redis = 'down';
    }
    return {
      status: redis === 'ok' ? 'ok' : 'degraded',
      redis,
      timestamp: new Date().toISOString(),
    };
  }
}
