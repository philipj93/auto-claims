import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';

import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { SessionService } from '../src/auth/session.service';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { UsersService } from '../src/users/users.service';
import { UserSession } from '../src/entities/user-session.entity';
import { hashPassword } from '../src/auth/hashing';
import { makeUser } from './utils/fixtures';
import { inMemorySessionRepo } from './utils/session-repo';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let sessionRepo: ReturnType<typeof inMemorySessionRepo>;
  const userId = '11111111-1111-4111-8111-111111111111';
  const users = {
    findByUsername: vi.fn(),
    existsByUsernameOrEmail: vi.fn(),
    createUser: vi.fn(),
    findOne: vi.fn(),
    findAuthById: vi.fn(),
  };

  beforeAll(async () => {
    sessionRepo = inMemorySessionRepo();
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret', signOptions: { expiresIn: '1h' } })],
      controllers: [AuthController],
      providers: [
        AuthService,
        SessionService,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: UsersService, useValue: users },
        { provide: getRepositoryToken(UserSession), useValue: sessionRepo },
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

  beforeEach(() => {
    sessionRepo._rows.clear();
    users.findOne.mockResolvedValue(makeUser({ id: userId }));
    users.findAuthById.mockResolvedValue({ id: userId, username: 'ada' });
  });

  /** Log in and return the issued { accessToken, refreshToken }. */
  async function login() {
    const passwordHash = await hashPassword('Sup3r$ecret');
    users.findByUsername.mockResolvedValue(makeUser({ id: userId, username: 'ada', passwordHash }));
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'ada', password: 'Sup3r$ecret' })
      .expect(200);
    return res.body as { accessToken: string; refreshToken: string };
  }

  it('logs in with valid credentials (200) and returns an access + refresh token', async () => {
    const body = await login();
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
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

  it('rotates the refresh token on POST /api/auth/refresh (200)', async () => {
    const { refreshToken } = await login();

    const res = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken })
      .expect(200);

    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.refreshToken).not.toBe(refreshToken); // rotated
  });

  it('revokes the session when a rotated refresh token is reused (401)', async () => {
    const { refreshToken } = await login();
    await request(app.getHttpServer()).post('/api/auth/refresh').send({ refreshToken }).expect(200);

    // replaying the now-rotated token is rejected...
    await request(app.getHttpServer()).post('/api/auth/refresh').send({ refreshToken }).expect(401);
    // ...and the session is gone, so even the latest token would be invalid now.
    expect(sessionRepo._rows.size).toBe(0);
  });

  it('rejects a malformed refresh token (401)', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: 'not-a-real-token' })
      .expect(401);
  });

  it('logs out and invalidates the refresh token (204 then 401)', async () => {
    const { refreshToken } = await login();

    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .send({ refreshToken })
      .expect(204);

    await request(app.getHttpServer()).post('/api/auth/refresh').send({ refreshToken }).expect(401);
  });

  it('rejects refresh/logout bodies missing the token (400)', async () => {
    await request(app.getHttpServer()).post('/api/auth/refresh').send({}).expect(400);
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .send({ refreshToken: '' })
      .expect(400);
  });

  it('blocks POST /api/auth/logout-all without a token (401)', async () => {
    await request(app.getHttpServer()).post('/api/auth/logout-all').expect(401);
  });

  it('logout-all revokes every session for the user (204, all tokens dead)', async () => {
    const first = await login();
    const second = await login();
    expect(sessionRepo._rows.size).toBe(2);

    await request(app.getHttpServer())
      .post('/api/auth/logout-all')
      .set('Authorization', `Bearer ${second.accessToken}`)
      .expect(204);

    expect(sessionRepo._rows.size).toBe(0);
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: first.refreshToken })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: second.refreshToken })
      .expect(401);
  });

  it('returns the signed-in user from GET /api/auth/me with a valid token (200)', async () => {
    const { accessToken } = await login();
    const res = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body).toMatchObject({ username: 'ada' });
    expect(res.body).not.toHaveProperty('passwordHash');
  });
});
