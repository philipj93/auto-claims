import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildDataSourceOptions } from './database/typeorm.config';
import { UsersModule } from './users/users.module';
import { ClaimsModule } from './claims/claims.module';
import { AuthModule } from './auth/auth.module';
import { RedisModule } from './redis/redis.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    RedisModule,
    TypeOrmModule.forRootAsync({
      useFactory: () => buildDataSourceOptions(),
    }),
    UsersModule,
    ClaimsModule,
    AuthModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
