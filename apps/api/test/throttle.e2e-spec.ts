import { afterAll, beforeAll, describe, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';

import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { SessionService } from '../src/auth/session.service';
import { UsersService } from '../src/users/users.service';
import { UserSession } from '../src/entities/user-session.entity';
import { hashPassword } from '../src/auth/hashing';
import { makeUser } from './utils/fixtures';
import { inMemorySessionRepo } from './utils/session-repo';

describe('Throttling (e2e)', () => {
  let app: INestApplication;
  const users = {
    findByUsername: vi.fn(),
    existsByUsernameOrEmail: vi.fn(),
    createUser: vi.fn(),
    findOne: vi.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({ secret: 'test-secret', signOptions: { expiresIn: '1h' } }),
        // Default in-memory storage — no Redis needed in CI. Same guard + @Throttle
        // metadata as production; only the storage backend differs.
        ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ttl: 60_000, limit: 100 }] }),
      ],
      controllers: [AuthController],
      providers: [
        AuthService,
        SessionService,
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: UsersService, useValue: users },
        { provide: getRepositoryToken(UserSession), useValue: inMemorySessionRepo() },
        { provide: ConfigService, useValue: { get: (_k: string, d: string) => d } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  afterAll(async () => app.close());

  it('allows 5 logins per minute, then returns 429', async () => {
    const passwordHash = await hashPassword('Sup3r$ecret');
    users.findByUsername.mockResolvedValue(makeUser({ username: 'ada', passwordHash }));

    const server = app.getHttpServer();
    for (let i = 0; i < 5; i++) {
      await request(server)
        .post('/api/auth/login')
        .send({ username: 'ada', password: 'Sup3r$ecret' })
        .expect(200);
    }
    await request(server)
      .post('/api/auth/login')
      .send({ username: 'ada', password: 'Sup3r$ecret' })
      .expect(429);
  });
});
