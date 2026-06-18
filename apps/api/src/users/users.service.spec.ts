import { beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { User } from '../entities/user.entity';
import { Claim } from '../entities/claim.entity';
import {
  createMockQueryBuilder,
  createMockRepository,
  type MockRepository,
} from '../../test/utils/mock-repository';
import { USER_ID, makeClaim, makeUser } from '../../test/utils/fixtures';
import { PaginationQueryDto } from '../common/pagination.dto';
import { FindUsersQueryDto } from './dto/find-users-query.dto';

describe('UsersService', () => {
  let service: UsersService;
  let users: MockRepository<User>;
  let claims: MockRepository<Claim>;

  beforeEach(async () => {
    users = createMockRepository<User>();
    claims = createMockRepository<Claim>();

    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: users },
        { provide: getRepositoryToken(Claim), useValue: claims },
      ],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  describe('findAll', () => {
    const query = { page: 1, limit: 12, skip: 0 } as PaginationQueryDto;

    it('attaches a claim count to each user, defaulting to 0', async () => {
      const ada = makeUser({ id: USER_ID, lastName: 'Lovelace' });
      const grace = makeUser({
        id: '99999999-9999-4999-8999-999999999999',
        firstName: 'Grace',
        lastName: 'Hopper',
      });
      users.findAndCount!.mockResolvedValue([[grace, ada], 2]);
      claims.createQueryBuilder!.mockReturnValue(
        createMockQueryBuilder({ raw: [{ userId: USER_ID, count: '3' }] }),
      );

      const result = await service.findAll(query);

      expect(users.findAndCount).toHaveBeenCalledWith({
        order: { lastName: 'ASC', firstName: 'ASC' },
        skip: 0,
        take: 12,
      });
      const counts = Object.fromEntries(result.data.map((u) => [u.id, u.claimCount]));
      expect(counts[USER_ID]).toBe(3);
      expect(counts[grace.id]).toBe(0);
    });

    it('returns pagination metadata derived from the total count', async () => {
      users.findAndCount!.mockResolvedValue([[makeUser()], 30]);
      claims.createQueryBuilder!.mockReturnValue(createMockQueryBuilder({ raw: [] }));

      const { meta } = await service.findAll({
        page: 2,
        limit: 12,
        skip: 12,
      } as PaginationQueryDto);

      expect(meta).toEqual({
        page: 2,
        limit: 12,
        total: 30,
        totalPages: 3,
        hasPreviousPage: true,
        hasNextPage: true,
      });
    });

    it('skips the claim-count query when the page is empty', async () => {
      users.findAndCount!.mockResolvedValue([[], 0]);

      const result = await service.findAll(query);

      expect(result.data).toEqual([]);
      expect(claims.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('findAll — search', () => {
    const ada = makeUser({ id: USER_ID, firstName: 'Ada', lastName: 'Lovelace' });

    function searchQuery(search: string) {
      return { page: 1, limit: 12, skip: 0, search } as FindUsersQueryDto;
    }

    it('runs a trigram search and attaches claim counts', async () => {
      const userQb = createMockQueryBuilder({ entities: [ada], count: 1 });
      users.createQueryBuilder!.mockReturnValue(userQb);
      claims.createQueryBuilder!.mockReturnValue(
        createMockQueryBuilder({ raw: [{ userId: USER_ID, count: '4' }] }),
      );

      const result = await service.findAll(searchQuery('stevn'));

      // Took the search branch, not the plain list branch.
      expect(users.createQueryBuilder).toHaveBeenCalledWith('user');
      expect(users.findAndCount).not.toHaveBeenCalled();
      // Ranked by trigram similarity.
      expect(userQb.where).toHaveBeenCalledWith(expect.stringContaining('word_similarity'));
      expect(userQb.getManyAndCount).toHaveBeenCalled();
      // Claim count + pagination total flow through.
      expect(result.data[0]).toMatchObject({ id: USER_ID, claimCount: 4 });
      expect(result.meta.total).toBe(1);
    });

    it('also matches an exact policy-number prefix', async () => {
      const userQb = createMockQueryBuilder({ entities: [ada], count: 1 });
      users.createQueryBuilder!.mockReturnValue(userQb);
      claims.createQueryBuilder!.mockReturnValue(createMockQueryBuilder({ raw: [] }));

      await service.findAll(searchQuery('POL-ABC'));

      expect(userQb.orWhere).toHaveBeenCalledWith(expect.stringContaining('policies'));
    });

    it('treats a whitespace-only search as no search (plain list path)', async () => {
      users.findAndCount!.mockResolvedValue([[ada], 1]);
      claims.createQueryBuilder!.mockReturnValue(createMockQueryBuilder({ raw: [] }));

      await service.findAll(searchQuery('   '));

      expect(users.findAndCount).toHaveBeenCalled();
      expect(users.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('returns the user with vehicles and policies', async () => {
      const user = makeUser();
      users.findOne!.mockResolvedValue(user);

      const result = await service.findOne(USER_ID);

      expect(result).toBe(user);
      expect(users.findOne).toHaveBeenCalledWith({
        where: { id: USER_ID },
        relations: { vehicles: true, policies: true },
      });
    });

    it('throws NotFoundException when the user is missing', async () => {
      users.findOne!.mockResolvedValue(null);

      await expect(service.findOne(USER_ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findClaims', () => {
    it("returns the user's claims ordered by reported date", async () => {
      users.findOne!.mockResolvedValue(makeUser());
      const rows = [makeClaim()];
      claims.find!.mockResolvedValue(rows);

      const result = await service.findClaims(USER_ID);

      expect(result).toBe(rows);
      expect(claims.find).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        relations: { vehicle: true },
        order: { reportedDate: 'DESC' },
      });
    });

    it('throws (and does not query claims) when the user does not exist', async () => {
      users.findOne!.mockResolvedValue(null);

      await expect(service.findClaims(USER_ID)).rejects.toThrow(NotFoundException);
      expect(claims.find).not.toHaveBeenCalled();
    });
  });
});
