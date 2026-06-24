import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { Paginated } from '@repo/types';
import { User } from '../entities/user.entity';
import { Claim } from '../entities/claim.entity';
import { FindUsersQueryDto } from './dto/find-users-query.dto';
import { paginate } from '../common/pagination';
import { CacheService } from '../cache/cache.service';
import { USERS_LIST_NS, usersListKey, everythingIn, LIST_TTL_SECONDS } from '../cache/cache.keys';

export type UserWithCount = User & { claimCount: number };

/**
 * Bare column expression (no table alias) that the fuzzy search ranks on.
 * The GIN trigram index in AddPolicyholderSearchIndex must index this EXACT
 * expression for word_similarity() queries to use it. Migrations must be
 * self-contained, so that migration repeats this literal rather than importing
 * it — `users.search-expr.spec.ts` asserts the two stay in sync.
 */
export const USER_SEARCH_EXPR =
  "first_name || ' ' || last_name || ' ' || email || ' ' || COALESCE(phone, '')";

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Claim)
    private readonly claims: Repository<Claim>,
    private readonly cache: CacheService,
  ) {}

  /** word_similarity floor for fuzzy matches (pg_trgm); term goes first in word_similarity(term, text). */
  private static readonly WORD_SIMILARITY_THRESHOLD = 0.3;

  /** USER_SEARCH_EXPR with each column qualified by the `user` query-builder alias. */
  private static readonly SEARCH_EXPR = USER_SEARCH_EXPR.replace(
    /first_name|last_name|email|phone/g,
    (col) => `user.${col}`,
  );

  async findAll(query: FindUsersQueryDto): Promise<Paginated<UserWithCount>> {
    return this.cache.wrap(usersListKey(query), LIST_TTL_SECONDS, () => this.loadAll(query));
  }

  private async loadAll(query: FindUsersQueryDto): Promise<Paginated<UserWithCount>> {
    const search = query.search?.trim();
    if (search) {
      return this.search(search, query);
    }

    const [users, total] = await this.users.findAndCount({
      order: { lastName: 'ASC', firstName: 'ASC' },
      skip: query.skip,
      take: query.limit,
    });

    return this.withClaimCounts(users, total, query.page, query.limit);
  }

  /**
   * Fuzzy policyholder lookup: trigram similarity over name/email/phone, OR an
   * exact policy-number prefix hit (via an EXISTS subquery so a holder with many
   * matching policies is never duplicated). Policy hits sort above name matches.
   */
  private async search(
    term: string,
    { page, limit, skip }: FindUsersQueryDto,
  ): Promise<Paginated<UserWithCount>> {
    const expr = UsersService.SEARCH_EXPR;
    const policyMatch =
      'EXISTS (SELECT 1 FROM policies p WHERE p.user_id = user.id AND p.policy_number ILIKE :prefix)';

    const [users, total] = await this.users
      .createQueryBuilder('user')
      .where(`word_similarity(:term, ${expr}) >= :threshold`)
      .orWhere(policyMatch)
      .setParameters({
        term,
        prefix: `${term}%`,
        threshold: UsersService.WORD_SIMILARITY_THRESHOLD,
      })
      .orderBy(policyMatch, 'DESC')
      .addOrderBy(`word_similarity(:term, ${expr})`, 'DESC')
      .addOrderBy('user.last_name', 'ASC')
      .addOrderBy('user.first_name', 'ASC')
      .offset(skip)
      .limit(limit)
      .getManyAndCount();

    return this.withClaimCounts(users, total, page, limit);
  }

  /** Attach each user's claim count and wrap the page in the pagination envelope. */
  private async withClaimCounts(
    users: User[],
    total: number,
    page: number,
    limit: number,
  ): Promise<Paginated<UserWithCount>> {
    const countByUser = await this.claimCountsFor(users.map((u) => u.id));
    const data = users.map((user) => ({
      ...user,
      claimCount: countByUser.get(user.id) ?? 0,
    }));
    return paginate(data, total, page, limit);
  }

  /** Map of userId → claim count, restricted to the given user ids. */
  private async claimCountsFor(userIds: string[]): Promise<Map<string, number>> {
    if (userIds.length === 0) {
      return new Map();
    }

    const counts = await this.claims
      .createQueryBuilder('claim')
      .select('claim.user_id', 'userId')
      .addSelect('COUNT(*)', 'count')
      .where({ userId: In(userIds) })
      .groupBy('claim.user_id')
      .getRawMany<{ userId: string; count: string }>();

    return new Map(counts.map((c) => [c.userId, parseInt(c.count, 10)]));
  }

  async findOne(id: string): Promise<User> {
    const user = await this.users.findOne({
      where: { id },
      relations: { vehicles: true, policies: true },
    });
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
  }

  async findClaims(id: string): Promise<Claim[]> {
    await this.findOne(id); // ensures the user exists (404 otherwise)
    return this.claims.find({
      where: { userId: id },
      relations: { vehicle: true },
      order: { reportedDate: 'DESC' },
    });
  }

  /**
   * Look a user up by username for authentication. Unlike every other read,
   * this explicitly selects `passwordHash` (the column is `select: false`),
   * so the result is safe to verify against but must never be returned as-is.
   */
  findByUsername(username: string): Promise<User | null> {
    return this.users.findOne({
      where: { username },
      select: {
        id: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true,
        passwordHash: true,
      },
    });
  }

  /**
   * Minimal lookup for minting an access token on refresh: selects only the
   * fields the JWT payload needs, with no relations. Returns null if the user
   * no longer exists (caller maps that to a 401, not a 404).
   */
  findAuthById(id: string): Promise<Pick<User, 'id' | 'username'> | null> {
    return this.users.findOne({ where: { id }, select: { id: true, username: true } });
  }

  /** True if any user already uses this username or email (registration guard). */
  async existsByUsernameOrEmail(username: string, email: string): Promise<boolean> {
    const existing = await this.users.findOne({
      where: [{ username }, { email }],
      select: { id: true },
    });
    return existing !== null;
  }

  /** Persist a new user. The caller supplies an already-hashed password. */
  async createUser(data: {
    username: string;
    email: string;
    firstName: string;
    lastName: string;
    passwordHash: string;
  }): Promise<User> {
    const user = await this.users.save(this.users.create(data));
    // A new user belongs in the lists; bust them so it shows up immediately.
    await this.cache.delByPattern(everythingIn(USERS_LIST_NS));
    return user;
  }
}
