import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ClaimStatus, ClaimType } from '@repo/types';
import { ClaimsController } from './claims.controller';
import { ClaimsService } from './claims.service';
import { CLAIM_ID, USER_ID, VEHICLE_ID, makeClaim } from '../../test/utils/fixtures';

describe('ClaimsController', () => {
  let controller: ClaimsController;
  const service = {
    findAll: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
    updateStatus: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [ClaimsController],
      providers: [{ provide: ClaimsService, useValue: service }],
    }).compile();

    controller = moduleRef.get(ClaimsController);
  });

  it('delegates findAll with the query filters', async () => {
    const query = { status: ClaimStatus.PAID };
    const rows = [makeClaim()];
    service.findAll.mockResolvedValue(rows);

    await expect(controller.findAll(query)).resolves.toBe(rows);
    expect(service.findAll).toHaveBeenCalledWith(query);
  });

  it('delegates findOne with the id', async () => {
    const claim = makeClaim();
    service.findOne.mockResolvedValue(claim);

    await expect(controller.findOne(CLAIM_ID)).resolves.toBe(claim);
    expect(service.findOne).toHaveBeenCalledWith(CLAIM_ID);
  });

  it('delegates create with the dto', async () => {
    const dto = {
      userId: USER_ID,
      vehicleId: VEHICLE_ID,
      type: ClaimType.COLLISION,
      description: 'Rear-ended at a red light.',
      incidentDate: '2024-05-01T12:00:00.000Z',
      estimatedAmount: 5000,
    };
    const created = makeClaim();
    service.create.mockResolvedValue(created);

    await expect(controller.create(dto)).resolves.toBe(created);
    expect(service.create).toHaveBeenCalledWith(dto);
  });

  it('delegates updateStatus with id and dto', async () => {
    const dto = { status: ClaimStatus.APPROVED, approvedAmount: 4200 };
    const updated = makeClaim({ status: ClaimStatus.APPROVED });
    service.updateStatus.mockResolvedValue(updated);

    await expect(controller.updateStatus(CLAIM_ID, dto)).resolves.toBe(updated);
    expect(service.updateStatus).toHaveBeenCalledWith(CLAIM_ID, dto);
  });
});
