/** DI token for the shared ioredis client (used by RedisModule + the throttler storage). */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');
