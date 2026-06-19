import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { ClaimStatus, ClaimType } from '@repo/types';

import { HealthController } from '../src/health.controller';
import { RedisService } from '../src/redis/redis.module';
import { UsersController } from '../src/users/users.controller';
import { UsersService } from '../src/users/users.service';
import { ClaimsController } from '../src/claims/claims.controller';
import { ClaimsService } from '../src/claims/claims.service';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { User } from '../src/entities/user.entity';
import { Vehicle } from '../src/entities/vehicle.entity';
import { Claim } from '../src/entities/claim.entity';

import {
  createMockQueryBuilder,
  createMockRepository,
  type MockRepository,
} from './utils/mock-repository';
import {
  CLAIM_ID,
  USER_ID,
  VEHICLE_ID,
  makeClaim,
  makeUser,
  makeVehicle,
} from './utils/fixtures';

/**
 * Full HTTP-pipeline E2E: the real controllers, the global `ValidationPipe`,
 * `ParseUUIDPipe`, and Nest's exception -> HTTP-status mapping. Repositories are
 * mocked, so these tests exercise everything *except* the database — fast and
 * runnable in CI without Postgres.
 */
describe('API (e2e)', () => {
  let app: INestApplication;
  let users: MockRepository<User>;
  let vehicles: MockRepository<Vehicle>;
  let claims: MockRepository<Claim>;
  let authHeader: string;

  // Minimal EntityManager mock used inside dataSource.transaction() callbacks.
  const manager = {
    findOne: vi.fn(),
    save: vi.fn(),
    create: vi.fn((_Entity: unknown, dto: unknown) => dto),
  };

  // DataSource mock whose transaction() immediately invokes the callback with
  // the mock manager — matching real TypeORM behaviour without a live DB.
  const dataSource = {
    transaction: vi.fn((cb: (m: typeof manager) => Promise<unknown>) => cb(manager)),
  };

  beforeAll(async () => {
    users = createMockRepository<User>();
    vehicles = createMockRepository<Vehicle>();
    claims = createMockRepository<Claim>();

    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret', signOptions: { expiresIn: '1h' } })],
      controllers: [HealthController, UsersController, ClaimsController, AuthController],
      providers: [
        UsersService,
        ClaimsService,
        AuthService,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: getRepositoryToken(User), useValue: users },
        { provide: getRepositoryToken(Vehicle), useValue: vehicles },
        { provide: getRepositoryToken(Claim), useValue: claims },
        { provide: DataSource, useValue: dataSource },
        { provide: RedisService, useValue: { ping: async () => 'PONG' } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    // Mirror the production bootstrap (src/main.ts) so the pipeline matches.
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

    const jwt = app.get(JwtService);
    authHeader = `Bearer ${await jwt.signAsync({ sub: USER_ID, username: 'ada' })}`;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    for (const repo of [users, vehicles, claims]) {
      for (const fn of Object.values(repo)) fn.mockReset();
    }
    claims.create!.mockImplementation((dto) => dto);
    manager.findOne.mockReset();
    manager.save.mockReset();
  });

  const http = () => request(app.getHttpServer());

  describe('GET /api/health', () => {
    it('returns ok', async () => {
      const res = await http().get('/api/health').expect(200);
      expect(res.body.status).toBe('ok');
    });
  });

  it('rejects protected routes without a token (401)', async () => {
    await http().get('/api/users').expect(401);
  });

  describe('GET /api/users', () => {
    it('returns a page of users with claim counts and pagination meta', async () => {
      users.findAndCount!.mockResolvedValue([[makeUser()], 1]);
      claims.createQueryBuilder!.mockReturnValue(
        createMockQueryBuilder({ raw: [{ userId: USER_ID, count: '2' }] }),
      );

      const res = await http().get('/api/users').set('Authorization', authHeader).expect(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject({ id: USER_ID, claimCount: 2 });
      expect(res.body.meta).toMatchObject({ page: 1, limit: 12, total: 1, totalPages: 1 });
    });

    it('coerces and forwards page/limit query params to the repository', async () => {
      users.findAndCount!.mockResolvedValue([[makeUser()], 50]);
      claims.createQueryBuilder!.mockReturnValue(createMockQueryBuilder({ raw: [] }));

      await http().get('/api/users?page=3&limit=10').set('Authorization', authHeader).expect(200);
      expect(users.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it('rejects a non-positive page with 400', async () => {
      await http().get('/api/users?page=0').set('Authorization', authHeader).expect(400);
    });

    it('returns search results via the query-builder path', async () => {
      users.createQueryBuilder!.mockReturnValue(
        createMockQueryBuilder({ entities: [makeUser()], count: 1 }),
      );
      claims.createQueryBuilder!.mockReturnValue(
        createMockQueryBuilder({ raw: [{ userId: USER_ID, count: '1' }] }),
      );

      const res = await http()
        .get('/api/users?search=stevn')
        .set('Authorization', authHeader)
        .expect(200);
      expect(res.body.data[0]).toMatchObject({ id: USER_ID, claimCount: 1 });
      expect(users.createQueryBuilder).toHaveBeenCalledWith('user');
      expect(users.findAndCount).not.toHaveBeenCalled();
    });

    it('rejects a search longer than 100 chars with 400', async () => {
      await http()
        .get(`/api/users?search=${'x'.repeat(101)}`)
        .set('Authorization', authHeader)
        .expect(400);
    });
  });

  describe('GET /api/users/:id/claims', () => {
    it('404s for an unknown user', async () => {
      users.findOne!.mockResolvedValue(null);
      await http().get(`/api/users/${USER_ID}/claims`).set('Authorization', authHeader).expect(404);
    });
  });

  describe('GET /api/claims/:id', () => {
    it('rejects a malformed UUID with 400 (ParseUUIDPipe)', async () => {
      await http().get('/api/claims/not-a-uuid').set('Authorization', authHeader).expect(400);
      expect(claims.findOne).not.toHaveBeenCalled();
    });

    it('404s when the claim is missing', async () => {
      claims.findOne!.mockResolvedValue(null);
      await http().get(`/api/claims/${CLAIM_ID}`).set('Authorization', authHeader).expect(404);
    });

    it('returns the claim when found', async () => {
      claims.findOne!.mockResolvedValue(makeClaim());
      const res = await http()
        .get(`/api/claims/${CLAIM_ID}`)
        .set('Authorization', authHeader)
        .expect(200);
      expect(res.body).toMatchObject({ id: CLAIM_ID, status: ClaimStatus.SUBMITTED });
    });
  });

  describe('GET /api/claims (filters)', () => {
    it('rejects an invalid status filter with 400', async () => {
      await http().get('/api/claims?status=PENDING').set('Authorization', authHeader).expect(400);
    });

    it('passes valid filters through to the service', async () => {
      claims.find!.mockResolvedValue([makeClaim()]);
      await http()
        .get(`/api/claims?status=${ClaimStatus.SUBMITTED}&type=${ClaimType.COLLISION}`)
        .set('Authorization', authHeader)
        .expect(200);
      expect(claims.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: ClaimStatus.SUBMITTED, type: ClaimType.COLLISION },
        }),
      );
    });
  });

  describe('POST /api/claims', () => {
    const validBody = {
      userId: USER_ID,
      vehicleId: VEHICLE_ID,
      type: ClaimType.COLLISION,
      description: 'Rear-ended at a red light on Main St.',
      incidentDate: '2024-05-01T12:00:00.000Z',
      estimatedAmount: 5000,
    };

    it('400s on a body that fails validation', async () => {
      await http()
        .post('/api/claims')
        .set('Authorization', authHeader)
        .send({ type: 'COLLISION' })
        .expect(400);
    });

    it('400s on unknown properties (forbidNonWhitelisted)', async () => {
      await http()
        .post('/api/claims')
        .set('Authorization', authHeader)
        .send({ ...validBody, hackerField: 'x' })
        .expect(400);
    });

    it('400s when the referenced vehicle is missing', async () => {
      vehicles.findOne!.mockResolvedValue(null);
      await http().post('/api/claims').set('Authorization', authHeader).send(validBody).expect(400);
    });

    it('creates a claim and returns 201', async () => {
      vehicles.findOne!.mockResolvedValue(makeVehicle());
      claims.save!.mockResolvedValue(makeClaim());
      claims.findOne!.mockResolvedValue(makeClaim());

      const res = await http()
        .post('/api/claims')
        .set('Authorization', authHeader)
        .send(validBody)
        .expect(201);
      expect(res.body).toMatchObject({ id: CLAIM_ID });
      expect(claims.save).toHaveBeenCalledOnce();
    });
  });

  describe('PATCH /api/claims/:id/status', () => {
    it('400s on an invalid status', async () => {
      await http()
        .patch(`/api/claims/${CLAIM_ID}/status`)
        .set('Authorization', authHeader)
        .send({ status: 'WIP' })
        .expect(400);
    });

    it('updates the status and returns 200', async () => {
      // updateStatus runs inside dataSource.transaction(): use manager mocks.
      manager.findOne.mockResolvedValue(makeClaim());
      manager.save.mockResolvedValue(makeClaim());
      // After the transaction, the service calls this.findOne(id) via the repo.
      claims.findOne!.mockResolvedValue(makeClaim());

      const res = await http()
        .patch(`/api/claims/${CLAIM_ID}/status`)
        .set('Authorization', authHeader)
        .send({ status: ClaimStatus.APPROVED, approvedAmount: 4200 })
        .expect(200);
      expect(res.body).toMatchObject({ id: CLAIM_ID });
    });
  });
});
