import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import request from 'supertest';

import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { UsersService } from '../src/users/users.service';
import { hashPassword } from '../src/auth/hashing';
import { makeUser } from './utils/fixtures';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  const users = {
    findByUsername: vi.fn(),
    existsByUsernameOrEmail: vi.fn(),
    createUser: vi.fn(),
    findOne: vi.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret', signOptions: { expiresIn: '1h' } })],
      controllers: [AuthController],
      providers: [
        AuthService,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: UsersService, useValue: users },
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

  it('logs in with valid credentials (200) and returns a token', async () => {
    const passwordHash = await hashPassword('Sup3r$ecret');
    users.findByUsername.mockResolvedValue(makeUser({ username: 'ada', passwordHash }));

    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'ada', password: 'Sup3r$ecret' })
      .expect(200);

    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('rejects bad credentials (401)', async () => {
    users.findByUsername.mockResolvedValue(null);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'ada', password: 'nope' })
      .expect(401);
  });

  it('rejects a weak registration password (400)', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ username: 'ada', email: 'a@b.com', password: 'weak', firstName: 'A', lastName: 'B' })
      .expect(400);
  });

  it('blocks GET /api/auth/me without a token (401)', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
  });
});
