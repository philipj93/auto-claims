import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { USER_ID, makeClaim, makeUser } from '../../test/utils/fixtures';
import { PaginationQueryDto } from '../common/pagination.dto';

describe('UsersController', () => {
  let controller: UsersController;
  const service = {
    findAll: vi.fn(),
    findOne: vi.fn(),
    findClaims: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: service }],
    }).compile();

    controller = moduleRef.get(UsersController);
  });

  it('delegates findAll with the pagination query', async () => {
    const result = { data: [{ ...makeUser(), claimCount: 2 }], meta: {} };
    service.findAll.mockResolvedValue(result);
    const query = { page: 2, limit: 12, skip: 12 } as PaginationQueryDto;

    await expect(controller.findAll(query)).resolves.toBe(result);
    expect(service.findAll).toHaveBeenCalledWith(query);
  });

  it('delegates findOne with the id', async () => {
    const user = makeUser();
    service.findOne.mockResolvedValue(user);

    await expect(controller.findOne(USER_ID)).resolves.toBe(user);
    expect(service.findOne).toHaveBeenCalledWith(USER_ID);
  });

  it('delegates findClaims with the id', async () => {
    const rows = [makeClaim()];
    service.findClaims.mockResolvedValue(rows);

    await expect(controller.findClaims(USER_ID)).resolves.toBe(rows);
    expect(service.findClaims).toHaveBeenCalledWith(USER_ID);
  });
});
