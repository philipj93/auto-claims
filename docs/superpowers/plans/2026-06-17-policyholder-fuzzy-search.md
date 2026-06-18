# Fuzzy Policyholder Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add typo-tolerant ("fuzzy") server-side search to `GET /api/users` so a single query resolves the right policyholder, ranked best-match-first.

**Architecture:** A policyholder is a `User`. The existing list endpoint gains an optional `search` query param. When present, `UsersService` builds a Postgres `pg_trgm` similarity query (over name/email/phone) plus an exact policy-number prefix match (via an `EXISTS` subquery on `policies`), ranks the results, and reuses the existing claim-count + pagination plumbing. When absent, behavior is byte-for-byte identical to today.

**Tech Stack:** NestJS 11, TypeORM 0.3 (Postgres `pg_trgm`), class-validator/class-transformer, Vitest, supertest.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-06-17-policyholder-fuzzy-search-design.md`.
- **Response contract is frozen:** the endpoint still returns `Paginated<UserWithCount>`; each row keeps `claimCount`; `match_score` is internal and never serialized.
- **No-search path unchanged:** an absent/empty/whitespace-only `search` must call exactly the existing `findAll` repository path (`users.findAndCount` with `order: { lastName: 'ASC', firstName: 'ASC' }`).
- **Migration convention** (memory `db-schema-migration-convention`): synchronize in dev, migrations in prod; one committed migration per schema change. `pnpm --filter @repo/api migration:check` must stay green.
- **Similarity threshold** is a single named constant, initial value `0.3`.
- **The search expression string MUST be identical** everywhere it appears (service query + GIN index migration), or the index won't be used. Canonical form:
  `first_name || ' ' || last_name || ' ' || email || ' ' || COALESCE(phone, '')`
- **Test harness reality:** unit + e2e specs run with **mocked repositories — no live Postgres**. Therefore real trigram *ranking* is verified manually against the dev DB (Task 3); automated tests verify query *construction* and the HTTP contract only.
- Run all commands from the worktree root. Package filter: `pnpm --filter @repo/api <script>`.

---

### Task 1: `search` query param — DTO + controller wiring

**Files:**
- Create: `apps/api/src/users/dto/find-users-query.dto.ts`
- Create: `apps/api/src/users/dto/find-users-query.dto.spec.ts`
- Modify: `apps/api/src/users/users.controller.ts`

**Interfaces:**
- Produces: `FindUsersQueryDto extends PaginationQueryDto` with `search?: string` (trimmed, `@IsString`, `@MaxLength(100)`). Inherits `page`, `limit`, `skip`. Consumed by Task 2's `UsersService.findAll`.

- [ ] **Step 1: Write the failing DTO test**

Create `apps/api/src/users/dto/find-users-query.dto.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FindUsersQueryDto } from './find-users-query.dto';

function toDto(payload: Record<string, unknown>) {
  return plainToInstance(FindUsersQueryDto, payload);
}

describe('FindUsersQueryDto', () => {
  it('leaves search undefined when omitted (and keeps pagination defaults)', async () => {
    const dto = toDto({});
    expect(await validate(dto)).toEqual([]);
    expect(dto.search).toBeUndefined();
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(12);
  });

  it('trims surrounding whitespace from search', async () => {
    const dto = toDto({ search: '  ada  ' });
    expect(await validate(dto)).toEqual([]);
    expect(dto.search).toBe('ada');
  });

  it('rejects a search longer than 100 chars', async () => {
    const errors = await validate(toDto({ search: 'x'.repeat(101) }));
    expect(errors.map((e) => e.property)).toContain('search');
  });

  it('rejects a non-string search', async () => {
    const errors = await validate(toDto({ search: { not: 'a string' } }));
    expect(errors.map((e) => e.property)).toContain('search');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @repo/api test find-users-query`
Expected: FAIL — cannot resolve `./find-users-query.dto`.

- [ ] **Step 3: Implement the DTO**

Create `apps/api/src/users/dto/find-users-query.dto.ts`:

```ts
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination.dto';

/**
 * Query params for `GET /api/users`: pagination plus an optional fuzzy `search`.
 * `search` is trimmed before validation so a whitespace-only value collapses to
 * an empty string, which the service treats as "no search".
 */
export class FindUsersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @repo/api test find-users-query`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire the controller to the new DTO**

In `apps/api/src/users/users.controller.ts`, replace the `PaginationQueryDto` import and the `findAll` param type:

```ts
import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import { FindUsersQueryDto } from './dto/find-users-query.dto';
```

```ts
  /** GET /api/users?page=&limit=&search= — a page of users, each with a claim count. */
  @Get()
  findAll(@Query() query: FindUsersQueryDto) {
    return this.usersService.findAll(query);
  }
```

(Leave the `findOne` and `findClaims` handlers untouched.)

- [ ] **Step 6: Typecheck and commit**

Run: `pnpm --filter @repo/api check-types`
Expected: PASS (no type errors). The controller compiles because `FindUsersQueryDto` is assignable wherever the service still accepts `PaginationQueryDto` (Task 2 widens the service signature).

> Note: if `check-types` flags `findAll` here because the service signature is not yet widened, that is expected — proceed to commit; Task 2 resolves it. If you prefer a green typecheck at every commit, do Task 2's Step 5 signature change before this commit.

```bash
git add apps/api/src/users/dto/find-users-query.dto.ts \
        apps/api/src/users/dto/find-users-query.dto.spec.ts \
        apps/api/src/users/users.controller.ts
git commit -m "feat(users): accept optional search query param"
```

---

### Task 2: Fuzzy search in `UsersService`

**Files:**
- Modify: `apps/api/test/utils/mock-repository.ts` (extend the mock query builder)
- Modify: `apps/api/src/users/users.service.ts`
- Modify: `apps/api/src/users/users.service.spec.ts`

**Interfaces:**
- Consumes: `FindUsersQueryDto` (Task 1).
- Produces: `UsersService.findAll(query: FindUsersQueryDto): Promise<Paginated<UserWithCount>>` — branches to a private `search(term, query)` when `query.search` is a non-empty trimmed string. `search` returns the same `Paginated<UserWithCount>` shape. Consumed by Task 4 (e2e).

- [ ] **Step 1: Extend the mock query builder**

The search query uses builder methods the current mock lacks (`orWhere`, `setParameters`, `addOrderBy`, `offset`, `limit`, `getManyAndCount`). In `apps/api/test/utils/mock-repository.ts`, update `createMockQueryBuilder`:

```ts
export function createMockQueryBuilder(result: {
  raw?: unknown;
  entities?: unknown;
  count?: number;
}) {
  const qb: Record<string, ReturnType<typeof vi.fn>> = {};
  const chain = [
    'select',
    'addSelect',
    'where',
    'andWhere',
    'orWhere',
    'setParameters',
    'groupBy',
    'orderBy',
    'addOrderBy',
    'offset',
    'limit',
    'leftJoinAndSelect',
    'innerJoin',
  ];
  for (const method of chain) {
    qb[method] = vi.fn(() => qb);
  }
  qb.getRawMany = vi.fn(async () => result.raw ?? []);
  qb.getMany = vi.fn(async () => result.entities ?? []);
  qb.getOne = vi.fn(async () => (result.entities as unknown[])?.[0] ?? null);
  qb.getManyAndCount = vi.fn(async () => [
    (result.entities as unknown[]) ?? [],
    result.count ?? (result.entities as unknown[])?.length ?? 0,
  ]);
  return qb;
}
```

- [ ] **Step 2: Write the failing service tests**

Add a `describe('findAll — search', ...)` block to `apps/api/src/users/users.service.spec.ts` (keep existing imports; `createMockQueryBuilder`, `makeUser`, `USER_ID` are already imported):

```ts
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
      expect(userQb.where).toHaveBeenCalledWith(expect.stringContaining('similarity'));
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
```

Add the import at the top of the spec:

```ts
import { FindUsersQueryDto } from './dto/find-users-query.dto';
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @repo/api test users.service`
Expected: FAIL — `findAll` does not accept `search` / does not call `users.createQueryBuilder`.

- [ ] **Step 4: Implement the search branch**

In `apps/api/src/users/users.service.ts`:

1. Update the import and the `findAll` signature/branch:

```ts
import { FindUsersQueryDto } from './dto/find-users-query.dto';
```

```ts
  /** Trigram similarity cutoff for fuzzy matches (pg_trgm default). */
  private static readonly SIMILARITY_THRESHOLD = 0.3;

  /**
   * Keep identical to the GIN index expression in
   * `migrations/*-AddPolicyholderSearchIndex.ts`, or Postgres can't use the
   * index. Columns are NOT NULL except phone, which is coalesced.
   */
  private static readonly SEARCH_EXPR =
    "user.first_name || ' ' || user.last_name || ' ' || user.email || ' ' || COALESCE(user.phone, '')";

  async findAll(query: FindUsersQueryDto): Promise<Paginated<UserWithCount>> {
    const search = query.search?.trim();
    if (search) {
      return this.search(search, query);
    }

    const [users, total] = await this.users.findAndCount({
      order: { lastName: 'ASC', firstName: 'ASC' },
      skip: query.skip,
      take: query.limit,
    });

    const countByUser = await this.claimCountsFor(users.map((u) => u.id));
    const data = users.map((user) => ({
      ...user,
      claimCount: countByUser.get(user.id) ?? 0,
    }));

    return paginate(data, total, query.page, query.limit);
  }
```

2. Add the private `search` method (place it just after `findAll`, before `claimCountsFor`):

```ts
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
      .where(`similarity(${expr}, :term) >= :threshold`)
      .orWhere(policyMatch)
      .setParameters({
        term,
        prefix: `${term}%`,
        threshold: UsersService.SIMILARITY_THRESHOLD,
      })
      .orderBy(policyMatch, 'DESC')
      .addOrderBy(`similarity(${expr}, :term)`, 'DESC')
      .addOrderBy('user.last_name', 'ASC')
      .addOrderBy('user.first_name', 'ASC')
      .offset(skip)
      .limit(limit)
      .getManyAndCount();

    const countByUser = await this.claimCountsFor(users.map((u) => u.id));
    const data = users.map((user) => ({
      ...user,
      claimCount: countByUser.get(user.id) ?? 0,
    }));

    return paginate(data, total, page, limit);
  }
```

- [ ] **Step 5: Run the service tests to verify they pass**

Run: `pnpm --filter @repo/api test users.service`
Expected: PASS (existing `findAll`/`findOne`/`findClaims` tests + 3 new search tests).

- [ ] **Step 6: Typecheck and commit**

Run: `pnpm --filter @repo/api check-types`
Expected: PASS.

```bash
git add apps/api/src/users/users.service.ts \
        apps/api/src/users/users.service.spec.ts \
        apps/api/test/utils/mock-repository.ts
git commit -m "feat(users): fuzzy trigram search with policy-number lookup"
```

---

### Task 3: `pg_trgm` extension + GIN index migration (and dev seed)

**Files:**
- Create: `apps/api/src/migrations/<timestamp>-AddPolicyholderSearchIndex.ts`
- Modify: `apps/api/src/database/seed.ts`

**Interfaces:**
- Produces: prod DB has `pg_trgm` + a GIN trigram index matching `SEARCH_EXPR`; dev DB (seeded) has `pg_trgm`. No code consumes this directly; it makes Task 2's SQL runnable (dev) and fast (prod).

- [ ] **Step 1: Generate an empty migration file**

Run:
```bash
pnpm --filter @repo/api migration:create src/migrations/AddPolicyholderSearchIndex
```
Expected: creates `apps/api/src/migrations/<timestamp>-AddPolicyholderSearchIndex.ts` with empty `up`/`down`.

- [ ] **Step 2: Fill in the migration body**

Replace the generated `up`/`down` (keep the generated class name + timestamp):

```ts
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Trigram matching for fuzzy policyholder search (UsersService.search).
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    // Expression MUST match UsersService.SEARCH_EXPR exactly, or this index
    // can't accelerate the similarity() query.
    await queryRunner.query(
      `CREATE INDEX "IDX_users_search_trgm" ON "users" USING gin ` +
        `((first_name || ' ' || last_name || ' ' || email || ' ' || COALESCE(phone, '')) gin_trgm_ops)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_users_search_trgm"`);
    // Leave the pg_trgm extension in place; dropping it could break other objects.
  }
```

- [ ] **Step 3: Ensure the extension exists in dev (seed)**

Dev uses `synchronize` (no migrations run), so the seed must install `pg_trgm` or `similarity()` fails locally. In `apps/api/src/database/seed.ts`, immediately after `await AppDataSource.initialize();`, add:

```ts
  // Fuzzy search (UsersService.search) needs pg_trgm. Prod gets it via the
  // AddPolicyholderSearchIndex migration; dev runs synchronize, so install here.
  await AppDataSource.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
```

- [ ] **Step 4: Apply the migration and verify no schema drift**

Run (requires the local Postgres from `apps/api`'s env to be up):
```bash
pnpm --filter @repo/api migration:run
pnpm --filter @repo/api migration:check
```
Expected: `migration:run` applies `AddPolicyholderSearchIndex`; `migration:check` reports **"No changes in database schema were found"** (exit 0). TypeORM does not model functional `gin_trgm_ops` indexes, so it should not try to drop it.

> If `migration:check` instead emits a `DROP INDEX "IDX_users_search_trgm"` / recreate diff, the driver is introspecting the index. Resolve by keeping the index migration-only and excluding it from the drift check (e.g. a dedicated `migration:check` ignore or a `synchronize: false` index stub on the entity) — do **not** weaken the search to silence the check. Capture whichever fix you apply in a code comment.

- [ ] **Step 5: Manually verify real fuzzy ranking against the dev DB**

Automated tests use mocked repos and cannot prove Postgres ranking. Verify by hand:

```bash
pnpm --filter @repo/api db:seed
pnpm --filter @repo/api dev    # in another shell; then:
# Pick a real seeded surname from the seed output or a quick DB query, then
# query with a deliberate typo and confirm the intended holder ranks first:
curl -s 'http://localhost:3000/api/users?search=<typo-of-a-seeded-name>' | jq '.data[0]'
curl -s 'http://localhost:3000/api/users?search=POL-<prefix-of-a-seeded-policy>' | jq '.data[0]'
```
Expected: the typo query returns the intended policyholder as `data[0]`; the policy-number prefix query returns that policy's holder. Stop the dev server when done.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/migrations/*-AddPolicyholderSearchIndex.ts \
        apps/api/src/database/seed.ts
git commit -m "feat(db): pg_trgm extension + GIN trigram index for user search"
```

---

### Task 4: E2E HTTP contract + final verification

**Files:**
- Modify: `apps/api/test/app.e2e-spec.ts`

**Interfaces:**
- Consumes: the live `GET /api/users?search=` route (Tasks 1–2). Repos are mocked, so this asserts the HTTP/validation contract and pass-through, not Postgres ranking.

- [ ] **Step 1: Write the failing e2e tests**

In `apps/api/test/app.e2e-spec.ts`, inside `describe('GET /api/users', ...)`, add:

```ts
    it('returns search results via the query-builder path', async () => {
      users.createQueryBuilder!.mockReturnValue(
        createMockQueryBuilder({ entities: [makeUser()], count: 1 }),
      );
      claims.createQueryBuilder!.mockReturnValue(
        createMockQueryBuilder({ raw: [{ userId: USER_ID, count: '1' }] }),
      );

      const res = await http().get('/api/users?search=stevn').expect(200);
      expect(res.body.data[0]).toMatchObject({ id: USER_ID, claimCount: 1 });
      expect(users.createQueryBuilder).toHaveBeenCalledWith('user');
      expect(users.findAndCount).not.toHaveBeenCalled();
    });

    it('rejects a search longer than 100 chars with 400', async () => {
      await http().get(`/api/users?search=${'x'.repeat(101)}`).expect(400);
    });
```

- [ ] **Step 2: Run the e2e suite to verify the new tests pass**

Run: `pnpm --filter @repo/api test:e2e`
Expected: PASS, including the two new cases. (`createMockQueryBuilder`, `makeUser`, `USER_ID` are already imported in this file.)

- [ ] **Step 3: Full verification gate**

Run each and confirm a clean pass before committing:
```bash
pnpm --filter @repo/api lint
pnpm --filter @repo/api check-types
pnpm --filter @repo/api test
pnpm --filter @repo/api test:e2e
```
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/app.e2e-spec.ts
git commit -m "test(users): e2e contract for fuzzy search query param"
```

---

## Self-Review Notes

- **Spec coverage:** matching technique → Task 2 + Task 3; API contract (`search` param, frozen response, empty-search passthrough) → Tasks 1, 2, 4; index & migration + drift caveat → Task 3; testing (unit + contract, with manual ranking check) → Tasks 1, 2, 3 (Step 5), 4. The spec's "seed users e2e ranking" is adapted to a manual check (Task 3, Step 5) because the e2e harness mocks repositories — see Global Constraints.
- **Type consistency:** `FindUsersQueryDto`, `SEARCH_EXPR`, `SIMILARITY_THRESHOLD`, `search(term, query)`, and `IDX_users_search_trgm` are used identically across tasks. The `SEARCH_EXPR` string is duplicated in service + migration by necessity and both carry a comment pointing at the other.
- **No placeholders:** every code/command step is concrete except the two intentionally human-supplied manual values in Task 3 Step 5 (a real seeded name/policy number), which cannot be known until seed runs.
