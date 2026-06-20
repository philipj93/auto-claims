import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClaimStatus, ClaimType } from '@repo/types';
import { ClaimsService } from './claims.service';
import { Claim } from '../entities/claim.entity';
import { ClaimNote } from '../entities/claim-note.entity';
import { Vehicle } from '../entities/vehicle.entity';
import { createMockRepository, type MockRepository } from '../../test/utils/mock-repository';
import { CLAIM_ID, USER_ID, VEHICLE_ID, makeClaim, makeVehicle } from '../../test/utils/fixtures';
import { CacheService } from '../cache/cache.service';
import {
  CLAIMS_LIST_NS,
  USERS_LIST_NS,
  claimsListKey,
  everythingIn,
  LIST_TTL_SECONDS,
} from '../cache/cache.keys';

describe('ClaimsService', () => {
  let service: ClaimsService;
  let claims: MockRepository<Claim>;
  let vehicles: MockRepository<Vehicle>;
  let manager: {
    findOne: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  let dataSource: { transaction: ReturnType<typeof vi.fn> };
  let cache: {
    wrap: ReturnType<typeof vi.fn>;
    del: ReturnType<typeof vi.fn>;
    delByPattern: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    claims = createMockRepository<Claim>();
    vehicles = createMockRepository<Vehicle>();

    // Pass-through cache: wrap() just runs the factory, so existing repo-call
    // assertions hold; del/delByPattern are spies for invalidation assertions.
    cache = {
      wrap: vi.fn((_key: string, _ttl: number, factory: () => Promise<unknown>) => factory()),
      del: vi.fn(),
      delByPattern: vi.fn(),
    };

    // Mock EntityManager used inside dataSource.transaction callbacks.
    manager = {
      findOne: vi.fn(),
      save: vi.fn(),
      // `create` mirrors TypeORM's synchronous behaviour: just return the dto.
      create: vi.fn((_Entity: unknown, dto: unknown) => dto),
    };

    // Mock DataSource whose transaction() immediately invokes the callback
    // with the mock manager, then resolves — matching real TypeORM behaviour.
    dataSource = {
      transaction: vi.fn((cb: (m: typeof manager) => Promise<unknown>) => cb(manager)),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ClaimsService,
        { provide: getRepositoryToken(Claim), useValue: claims },
        { provide: getRepositoryToken(Vehicle), useValue: vehicles },
        { provide: DataSource, useValue: dataSource },
        { provide: CacheService, useValue: cache },
      ],
    }).compile();

    service = moduleRef.get(ClaimsService);
  });

  describe('findAll', () => {
    it('queries with no filters when the query is empty', async () => {
      const rows = [makeClaim()];
      claims.find!.mockResolvedValue(rows);

      const result = await service.findAll({});

      expect(result).toBe(rows);
      expect(claims.find).toHaveBeenCalledWith({
        where: {},
        relations: { user: true, vehicle: true },
        order: { reportedDate: 'DESC' },
      });
    });

    it('builds the where clause from the provided filters', async () => {
      claims.find!.mockResolvedValue([]);

      await service.findAll({
        userId: USER_ID,
        status: ClaimStatus.PAID,
        type: ClaimType.THEFT,
      });

      expect(claims.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: USER_ID,
            status: ClaimStatus.PAID,
            type: ClaimType.THEFT,
          },
        }),
      );
    });

    it('reads through the cache keyed by the query filters', async () => {
      claims.find!.mockResolvedValue([]);

      await service.findAll({ status: ClaimStatus.PAID });

      expect(cache.wrap).toHaveBeenCalledWith(
        claimsListKey({ status: ClaimStatus.PAID }),
        LIST_TTL_SECONDS,
        expect.any(Function),
      );
    });
  });

  describe('findOne', () => {
    it('returns the claim with all relations when found', async () => {
      const claim = makeClaim();
      claims.findOne!.mockResolvedValue(claim);

      const result = await service.findOne(CLAIM_ID);

      expect(result).toBe(claim);
      expect(claims.findOne).toHaveBeenCalledWith({
        where: { id: CLAIM_ID },
        relations: {
          user: true,
          vehicle: true,
          policy: true,
          documents: true,
          notes: true,
        },
        order: { notes: { createdAt: 'DESC' } },
      });
    });

    it('throws NotFoundException when the claim does not exist', async () => {
      claims.findOne!.mockResolvedValue(null);

      await expect(service.findOne(CLAIM_ID)).rejects.toThrow(NotFoundException);
      await expect(service.findOne(CLAIM_ID)).rejects.toThrow(`Claim ${CLAIM_ID} not found`);
    });
  });

  describe('create', () => {
    const baseDto = {
      userId: USER_ID,
      vehicleId: VEHICLE_ID,
      type: ClaimType.COLLISION,
      description: 'Rear-ended at a red light on Main St.',
      incidentDate: '2024-05-01T12:00:00.000Z',
      estimatedAmount: 5000,
    };

    it('rejects when the vehicle does not exist', async () => {
      vehicles.findOne!.mockResolvedValue(null);

      await expect(service.create({ ...baseDto })).rejects.toThrow(BadRequestException);
      expect(claims.save).not.toHaveBeenCalled();
    });

    it('rejects when the vehicle belongs to a different user', async () => {
      vehicles.findOne!.mockResolvedValue(makeVehicle({ userId: 'someone-else' }));

      await expect(service.create({ ...baseDto })).rejects.toThrow(
        'Vehicle does not belong to the given user',
      );
      expect(claims.save).not.toHaveBeenCalled();
    });

    it('creates a SUBMITTED claim with a generated number and defaults applied', async () => {
      vehicles.findOne!.mockResolvedValue(makeVehicle());
      claims.save!.mockResolvedValue(makeClaim({ id: CLAIM_ID }));
      const persisted = makeClaim();
      claims.findOne!.mockResolvedValue(persisted);

      const result = await service.create({ ...baseDto });

      // Returns the freshly re-fetched claim (with relations).
      expect(result).toBe(persisted);

      // The entity handed to `create` carries the derived/default values.
      const createArg = claims.create!.mock.calls[0][0];
      expect(createArg).toMatchObject({
        status: ClaimStatus.SUBMITTED,
        deductible: 0,
        injuryReported: false,
      });
      expect(createArg.incidentDate).toBeInstanceOf(Date);
      expect(createArg.reportedDate).toBeInstanceOf(Date);
      expect(createArg.claimNumber).toMatch(/^CLM-\d{4}-\d{6}$/);
      expect(claims.save).toHaveBeenCalledOnce();
    });

    it('honours explicitly provided deductible and injuryReported', async () => {
      vehicles.findOne!.mockResolvedValue(makeVehicle());
      claims.save!.mockResolvedValue(makeClaim());
      claims.findOne!.mockResolvedValue(makeClaim());

      await service.create({
        ...baseDto,
        deductible: 250,
        injuryReported: true,
      });

      expect(claims.create!.mock.calls[0][0]).toMatchObject({
        deductible: 250,
        injuryReported: true,
      });
    });

    it('invalidates the claims and users list caches', async () => {
      vehicles.findOne!.mockResolvedValue(makeVehicle());
      claims.save!.mockResolvedValue(makeClaim());
      claims.findOne!.mockResolvedValue(makeClaim());

      await service.create({ ...baseDto });

      expect(cache.delByPattern).toHaveBeenCalledWith(everythingIn(CLAIMS_LIST_NS));
      expect(cache.delByPattern).toHaveBeenCalledWith(everythingIn(USERS_LIST_NS));
    });
  });

  describe('updateStatus', () => {
    it('updates only the status when no optional fields are given', async () => {
      const claim = makeClaim({
        status: ClaimStatus.SUBMITTED,
        approvedAmount: null,
        adjusterName: null,
      });
      manager.findOne.mockResolvedValue(claim);
      manager.save.mockResolvedValue(claim);
      // findOne is also called by the trailing this.findOne(id) after the transaction.
      claims.findOne!.mockResolvedValue(claim);

      await service.updateStatus(CLAIM_ID, { status: ClaimStatus.UNDER_REVIEW });

      // First manager.save call is the mutated Claim.
      const savedClaim = manager.save.mock.calls[0][0];
      expect(savedClaim.status).toBe(ClaimStatus.UNDER_REVIEW);
      expect(savedClaim.approvedAmount).toBeNull();
      expect(savedClaim.adjusterName).toBeNull();

      // manager.create must have been called to build the audit ClaimNote.
      expect(manager.create).toHaveBeenCalledWith(
        ClaimNote,
        expect.objectContaining({
          claimId: CLAIM_ID,
          author: 'system',
        }),
      );
      // Second manager.save call persists the note.
      expect(manager.save).toHaveBeenCalledTimes(2);
    });

    it('applies approvedAmount and adjusterName when provided', async () => {
      const claim = makeClaim();
      manager.findOne.mockResolvedValue(claim);
      manager.save.mockResolvedValue(claim);
      claims.findOne!.mockResolvedValue(claim);

      await service.updateStatus(CLAIM_ID, {
        status: ClaimStatus.APPROVED,
        approvedAmount: 4200,
        adjusterName: 'Grace Hopper',
      });

      const savedClaim = manager.save.mock.calls[0][0];
      expect(savedClaim).toMatchObject({
        status: ClaimStatus.APPROVED,
        approvedAmount: 4200,
        adjusterName: 'Grace Hopper',
      });

      // Audit note must name the adjuster as author and mention the approved amount.
      expect(manager.create).toHaveBeenCalledWith(
        ClaimNote,
        expect.objectContaining({
          claimId: CLAIM_ID,
          author: 'Grace Hopper',
          body: expect.stringContaining('4200'),
        }),
      );
    });

    it('propagates NotFoundException for an unknown claim', async () => {
      manager.findOne.mockResolvedValue(null);

      await expect(service.updateStatus(CLAIM_ID, { status: ClaimStatus.PAID })).rejects.toThrow(
        NotFoundException,
      );
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('invalidates the claims and users list caches after a successful update', async () => {
      const claim = makeClaim();
      manager.findOne.mockResolvedValue(claim);
      manager.save.mockResolvedValue(claim);
      claims.findOne!.mockResolvedValue(claim);

      await service.updateStatus(CLAIM_ID, { status: ClaimStatus.UNDER_REVIEW });

      expect(cache.delByPattern).toHaveBeenCalledWith(everythingIn(CLAIMS_LIST_NS));
      expect(cache.delByPattern).toHaveBeenCalledWith(everythingIn(USERS_LIST_NS));
    });

    it('does not invalidate the cache when the claim does not exist', async () => {
      manager.findOne.mockResolvedValue(null);

      await expect(service.updateStatus(CLAIM_ID, { status: ClaimStatus.PAID })).rejects.toThrow(
        NotFoundException,
      );
      expect(cache.delByPattern).not.toHaveBeenCalled();
    });
  });

  it('generates unique-looking claim numbers for the current year', async () => {
    vehicles.findOne!.mockResolvedValue(makeVehicle());
    claims.save!.mockResolvedValue(makeClaim());
    claims.findOne!.mockResolvedValue(makeClaim());
    const year = new Date().getFullYear();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    await service.create({
      userId: USER_ID,
      vehicleId: VEHICLE_ID,
      type: ClaimType.GLASS,
      description: 'Windshield cracked by road debris.',
      incidentDate: '2024-05-01T12:00:00.000Z',
      estimatedAmount: 300,
    });

    expect(claims.create!.mock.calls[0][0].claimNumber).toBe(`CLM-${year}-550000`);
    vi.restoreAllMocks();
  });
});
