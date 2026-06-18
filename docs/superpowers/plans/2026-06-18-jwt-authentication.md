# JWT Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add username/password authentication (JWT bearer tokens) to the auto-claims portal end-to-end — API auth module + global guard, expanded seed data, and a Next.js login/register UI — implementing GitHub issue #1.

**Architecture:** Standalone `@nestjs/jwt` (no Passport) with a hand-written global `JwtAuthGuard` registered via `APP_GUARD`; routes opt out with a `@Public()` decorator. Passwords are hashed with bcrypt and stored in a `select: false` `password_hash` column on the `User` entity. The web app holds the access token in an httpOnly cookie set by a Next.js Server Action and forwards it as a `Authorization: Bearer` header on every RSC fetch.

**Tech Stack:** NestJS 11 + TypeORM (PostgreSQL 17), `@nestjs/jwt`, `bcrypt`, `class-validator`; Next.js 15 (App Router/RSC) + Tailwind v4 + shadcn/ui; shared `@repo/types`; Vitest (+ supertest e2e) for API, Vitest/Testing Library + Playwright for web.

## Global Constraints

- **Secure-by-default:** the `JwtAuthGuard` is global (`APP_GUARD`); every route is protected unless explicitly marked `@Public()`. Public routes: `GET /api/health`, `POST /api/auth/login`, `POST /api/auth/register`.
- **Bearer tokens only** on the API contract: `Authorization: Bearer <jwt>`. No server-side session store.
- **bcrypt** at `saltOrRounds = 10`. Never log or serialize a password or hash.
- **`password_hash` column is `select: false`** — never returned by default queries; never added to any response DTO or shared response type.
- **Entity change ⇒ migration:** the `User` entity changes, so a TypeORM migration must be generated and committed in the same change. CI runs `migration:run` then `migration:check` against an empty Postgres 17 — the build fails on uncommitted drift.
- **Shared types are the contract:** all request/response shapes live in `@repo/types` first; API DTOs `implements` them, web imports them.
- **Run scripts from the repo root** (Turbo builds `@repo/types` first); scope with `--filter @repo/api` / `--filter web`. Migration scripts run from `apps/api` (or `pnpm --filter @repo/api`).
- **Typecheck with `tsgo`** (`pnpm check-types`), lint with `pnpm lint`, format with Prettier (single quotes, semicolons, trailing commas, `printWidth: 100`).
- **Do not `git push`** — commit locally only; pushing/PR needs explicit confirmation.
- **Conventional commits**; each commit ends with the `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer.

## File Structure

**`packages/types/src/index.ts`** (modify) — add `username` to `User`; add `LoginInput`, `CreateUserInput`, `AuthUser`, `AuthResponse`, `JwtPayload`.

**API — `apps/api/src/`**
- `entities/user.entity.ts` (modify) — add `username` (unique) + `passwordHash` (`select: false`).
- `migrations/<ts>-AddUserAuth.ts` (create, generated) — add columns + unique index.
- `auth/hashing.ts` (create) — `hashPassword` / `comparePassword` bcrypt wrappers.
- `auth/auth.service.ts` (create) — validate credentials, register, sign JWT.
- `auth/auth.controller.ts` (create) — `POST /auth/register`, `POST /auth/login`, `GET /auth/me`.
- `auth/auth.module.ts` (create) — wires `JwtModule.registerAsync`, `AuthService`, controller, global guard.
- `auth/dto/login.dto.ts`, `auth/dto/register.dto.ts` (create).
- `auth/decorators/public.decorator.ts`, `auth/decorators/current-user.decorator.ts` (create).
- `auth/guards/jwt-auth.guard.ts` (create).
- `auth/auth.types.ts` (create) — `RequestUser` shape attached to `request.user`.
- `users/users.service.ts` (modify) — `findByUsername` (selects hash), `existsByUsernameOrEmail`, `createUser`.
- `users/users.module.ts` (modify) — `exports: [UsersService]`.
- `users/users.controller.ts`, `claims/claims.controller.ts`, `health.controller.ts` (modify) — `@Public()` where required.
- `database/seed.ts` (modify) — credentials per user, demo account, more claims/policies/vehicles.
- `.env` / `README.md` (modify) — `JWT_SECRET`, `JWT_EXPIRES_IN`.

**Web — `apps/web/src/`**
- `lib/api.ts` (modify) — attach bearer token from cookie; typed auth helpers; 401 handling.
- `lib/auth.ts` (create) — `getAccessToken`, `getCurrentUser`, cookie name constant.
- `app/login/page.tsx`, `app/login/actions.ts` (create).
- `app/register/page.tsx`, `app/register/actions.ts` (create).
- `app/logout/route.ts` (create) — clears cookie, redirects.
- `middleware.ts` (create) — redirect unauthenticated users to `/login`.
- `app/layout.tsx` (modify) — current-user + logout in header.
- `components/ui/input.tsx`, `components/ui/label.tsx` (create — shadcn primitives the forms need).

---

## Phase 1 — Shared types

### Task 1: Add auth types to `@repo/types`

**Files:**
- Modify: `packages/types/src/index.ts`

**Interfaces:**
- Produces: `User.username: string`; `LoginInput`, `CreateUserInput`, `AuthUser`, `AuthResponse`, `JwtPayload`.

- [ ] **Step 1: Add `username` to the `User` interface.** In `packages/types/src/index.ts`, inside `export interface User`, add `username` right after `id`:

```ts
export interface User {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Append the auth payload + response types** to the "Request payloads" section at the end of the file:

```ts
// ----- Auth -----

/** Credentials for POST /api/auth/login. */
export interface LoginInput {
  username: string;
  password: string;
}

/** Body for POST /api/auth/register — creates a user and signs them in. */
export interface CreateUserInput {
  username: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

/** Safe, public view of the authenticated user — never includes the password hash. */
export interface AuthUser {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
}

/** Response from login/register: the bearer token plus the signed-in user. */
export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

/** Decoded JWT claims. `sub` is the user id. */
export interface JwtPayload {
  sub: string;
  username: string;
}
```

- [ ] **Step 3: Build the package and typecheck.**

Run: `pnpm --filter @repo/types build && pnpm check-types`
Expected: PASS (no type errors). Note: existing fixtures/specs that build a `User` now lack `username` — they are fixed in Task 4/Task 6 where those files are touched; if `check-types` flags them now, proceed (they are addressed in later tasks) but do not commit until Task 4.

- [ ] **Step 4: Commit.**

```bash
git add packages/types/src/index.ts
git commit -m "feat(types): add auth input/response types and User.username

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 2 — User entity + migration

### Task 2: Add credential columns to the `User` entity

**Files:**
- Modify: `apps/api/src/entities/user.entity.ts`

**Interfaces:**
- Produces: `User.username: string`, `User.passwordHash: string` (column `password_hash`, `select: false`).

- [ ] **Step 1: Add the columns.** In `apps/api/src/entities/user.entity.ts`, add `username` (unique, indexed) after `lastName`, and `passwordHash` after `email`:

```ts
  @Column({ name: 'last_name' })
  lastName: string;

  @Index({ unique: true })
  @Column()
  username: string;

  @Index({ unique: true })
  @Column()
  email: string;

  /**
   * bcrypt hash. `select: false` keeps it out of every default query — load it
   * explicitly (e.g. UsersService.findByUsername) only for credential checks.
   */
  @Column({ name: 'password_hash', select: false })
  passwordHash: string;
```

- [ ] **Step 2: Typecheck the entity.**

Run: `pnpm --filter @repo/api check-types`
Expected: the entity compiles. Test fixtures that construct a `User` may now error on the missing `username`/`passwordHash` — that is fixed in Task 4; proceed.

- [ ] **Step 3: Generate the migration** (requires a running local Postgres synced to the *pre-change* schema). Ensure the dev DB is up and matches `main` first (`pnpm db:seed` on the base branch state, or a fresh DB + `pnpm --filter @repo/api migration:run`). Then, with the entity change in place:

Run (from `apps/api`): `pnpm migration:generate src/migrations/AddUserAuth`
Expected: a new file `apps/api/src/migrations/<timestamp>-AddUserAuth.ts` whose `up()` does roughly:

```ts
await queryRunner.query(`ALTER TABLE "users" ADD "username" character varying NOT NULL`);
await queryRunner.query(`ALTER TABLE "users" ADD "password_hash" character varying NOT NULL`);
await queryRunner.query(`CREATE UNIQUE INDEX "IDX_<hash>" ON "users" ("username")`);
```

> ⚠️ **Review the SQL.** Adding `NOT NULL` columns is safe in CI (the table is built empty from migrations) and locally (data is disposable via `pnpm db:seed`). It would fail against a populated table — acceptable here per the project's disposable-dev-data convention. Do not hand-edit the generated index hash names.

- [ ] **Step 4: Apply and verify no drift.**

Run (from `apps/api`):
```bash
pnpm migration:run
pnpm migration:check
```
Expected: `migration:run` applies cleanly; `migration:check` exits 0 (entities match the schema).

- [ ] **Step 5: Commit the entity + migration together.**

```bash
git add apps/api/src/entities/user.entity.ts apps/api/src/migrations/
git commit -m "feat(api): add username + password_hash to User entity with migration

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 3 — Password hashing

### Task 3: bcrypt hashing helpers

**Files:**
- Create: `apps/api/src/auth/hashing.ts`
- Test: `apps/api/src/auth/hashing.spec.ts`

**Interfaces:**
- Produces: `hashPassword(plain: string): Promise<string>`, `comparePassword(plain: string, hash: string): Promise<boolean>`.

- [ ] **Step 1: Add the dependency.**

Run (from repo root): `pnpm --filter @repo/api add bcrypt && pnpm --filter @repo/api add -D @types/bcrypt`
Expected: `bcrypt` in `dependencies`, `@types/bcrypt` in `devDependencies` of `apps/api/package.json`.

- [ ] **Step 2: Write the failing test.** Create `apps/api/src/auth/hashing.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { comparePassword, hashPassword } from './hashing';

describe('hashing', () => {
  it('hashes a password to a non-plaintext bcrypt string', async () => {
    const hash = await hashPassword('s3cret-pw');
    expect(hash).not.toBe('s3cret-pw');
    expect(hash.startsWith('$2')).toBe(true);
  });

  it('comparePassword returns true for the correct password', async () => {
    const hash = await hashPassword('s3cret-pw');
    expect(await comparePassword('s3cret-pw', hash)).toBe(true);
  });

  it('comparePassword returns false for a wrong password', async () => {
    const hash = await hashPassword('s3cret-pw');
    expect(await comparePassword('wrong', hash)).toBe(false);
  });
});
```

- [ ] **Step 3: Run it to verify it fails.**

Run: `pnpm --filter @repo/api exec vitest run src/auth/hashing.spec.ts`
Expected: FAIL — cannot resolve `./hashing`.

- [ ] **Step 4: Implement.** Create `apps/api/src/auth/hashing.ts`:

```ts
import * as bcrypt from 'bcrypt';

/** Work factor for bcrypt — matches the NestJS docs' recommended default. */
const SALT_ROUNDS = 10;

/** Hash a plaintext password for storage. */
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/** Constant-time compare of a plaintext password against a stored bcrypt hash. */
export function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

- [ ] **Step 5: Run it to verify it passes.**

Run: `pnpm --filter @repo/api exec vitest run src/auth/hashing.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit.**

```bash
git add apps/api/package.json apps/api/src/auth/hashing.ts apps/api/src/auth/hashing.spec.ts ../../pnpm-lock.yaml
git commit -m "feat(api): add bcrypt password hashing helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 4 — Users service credential methods

### Task 4: Extend `UsersService` for auth + fix fixtures

**Files:**
- Modify: `apps/api/src/users/users.service.ts`
- Modify: `apps/api/src/users/users.module.ts`
- Modify: `apps/api/test/utils/fixtures.ts`
- Test: `apps/api/src/users/users.service.spec.ts` (add cases)

**Interfaces:**
- Consumes: `User` entity (Task 2), `hashPassword` (Task 3).
- Produces:
  - `UsersService.findByUsername(username: string): Promise<User | null>` — **includes `passwordHash`**.
  - `UsersService.existsByUsernameOrEmail(username: string, email: string): Promise<boolean>`.
  - `UsersService.createUser(data: { username: string; email: string; firstName: string; lastName: string; passwordHash: string }): Promise<User>`.
  - `UsersModule` exports `UsersService`.

- [ ] **Step 1: Update fixtures** so `makeUser` satisfies the new required fields. In `apps/api/test/utils/fixtures.ts`, add to the `makeUser` object (after `id: USER_ID,`):

```ts
    username: 'ada',
```
and after `email: 'ada@example.com',`:
```ts
    passwordHash: '$2b$10$test.hash.value.placeholder.for.fixturesxxxxxxxxxxxx',
```

- [ ] **Step 2: Write failing tests** for the new methods. Append to `apps/api/src/users/users.service.spec.ts` (inside the top-level `describe('UsersService', ...)`):

```ts
  describe('findByUsername', () => {
    it('selects the password hash and returns the user', async () => {
      const ada = makeUser({ username: 'ada' });
      users.findOne!.mockResolvedValue(ada);

      const result = await service.findByUsername('ada');

      expect(users.findOne).toHaveBeenCalledWith({
        where: { username: 'ada' },
        select: {
          id: true,
          username: true,
          email: true,
          firstName: true,
          lastName: true,
          passwordHash: true,
        },
      });
      expect(result).toBe(ada);
    });

    it('returns null when no user matches', async () => {
      users.findOne!.mockResolvedValue(null);
      expect(await service.findByUsername('nobody')).toBeNull();
    });
  });

  describe('existsByUsernameOrEmail', () => {
    it('returns true when a user with that username or email exists', async () => {
      users.findOne!.mockResolvedValue(makeUser());
      expect(await service.existsByUsernameOrEmail('ada', 'ada@example.com')).toBe(true);
    });

    it('returns false when none exists', async () => {
      users.findOne!.mockResolvedValue(null);
      expect(await service.existsByUsernameOrEmail('ada', 'ada@example.com')).toBe(false);
    });
  });

  describe('createUser', () => {
    it('persists a new user from the given fields', async () => {
      const created = makeUser();
      users.save!.mockResolvedValue(created);

      const result = await service.createUser({
        username: 'ada',
        email: 'ada@example.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
        passwordHash: 'hash',
      });

      expect(users.create).toHaveBeenCalledWith({
        username: 'ada',
        email: 'ada@example.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
        passwordHash: 'hash',
      });
      expect(users.save).toHaveBeenCalled();
      expect(result).toBe(created);
    });
  });
```

- [ ] **Step 3: Run to verify failure.**

Run: `pnpm --filter @repo/api exec vitest run src/users/users.service.spec.ts`
Expected: FAIL — `service.findByUsername is not a function`, etc.

- [ ] **Step 4: Implement the methods.** In `apps/api/src/users/users.service.ts`, add these methods to `UsersService` (after `findClaims`):

```ts
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

  /** True if any user already uses this username or email (registration guard). */
  async existsByUsernameOrEmail(username: string, email: string): Promise<boolean> {
    const existing = await this.users.findOne({
      where: [{ username }, { email }],
      select: { id: true },
    });
    return existing !== null;
  }

  /** Persist a new user. The caller supplies an already-hashed password. */
  createUser(data: {
    username: string;
    email: string;
    firstName: string;
    lastName: string;
    passwordHash: string;
  }): Promise<User> {
    return this.users.save(this.users.create(data));
  }
```

- [ ] **Step 5: Export the service.** In `apps/api/src/users/users.module.ts`, add `exports`:

```ts
@Module({
  imports: [TypeOrmModule.forFeature([User, Claim])],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

- [ ] **Step 6: Run tests + typecheck.**

Run: `pnpm --filter @repo/api exec vitest run src/users/users.service.spec.ts && pnpm --filter @repo/api check-types`
Expected: PASS (existing + 5 new cases), no type errors.

- [ ] **Step 7: Commit.**

```bash
git add apps/api/src/users/ apps/api/test/utils/fixtures.ts
git commit -m "feat(api): add credential lookup/create methods to UsersService

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 5 — Guard, decorators, request-user type

### Task 5: `@Public()`, `@CurrentUser()`, `RequestUser`, and `JwtAuthGuard`

**Files:**
- Create: `apps/api/src/auth/auth.types.ts`
- Create: `apps/api/src/auth/decorators/public.decorator.ts`
- Create: `apps/api/src/auth/decorators/current-user.decorator.ts`
- Create: `apps/api/src/auth/guards/jwt-auth.guard.ts`
- Test: `apps/api/src/auth/guards/jwt-auth.guard.spec.ts`

**Interfaces:**
- Produces:
  - `IS_PUBLIC_KEY` (string), `Public()` decorator.
  - `RequestUser = AuthUser` attached at `request.user`.
  - `CurrentUser()` param decorator → `RequestUser`.
  - `JwtAuthGuard` (`CanActivate`): allows `@Public()` routes; else verifies the `Authorization: Bearer` JWT via `JwtService` and sets `request.user`.

- [ ] **Step 1: Request-user type.** Create `apps/api/src/auth/auth.types.ts`:

```ts
import type { AuthUser } from '@repo/types';

/** Shape attached to `request.user` after the JwtAuthGuard verifies a token. */
export type RequestUser = AuthUser;
```

- [ ] **Step 2: `@Public()` decorator.** Create `apps/api/src/auth/decorators/public.decorator.ts`:

```ts
import { SetMetadata } from '@nestjs/common';

/** Metadata key the JwtAuthGuard reads to allow unauthenticated access. */
export const IS_PUBLIC_KEY = 'isPublic';

/** Mark a route (or controller) as accessible without a valid JWT. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

- [ ] **Step 3: `@CurrentUser()` decorator.** Create `apps/api/src/auth/decorators/current-user.decorator.ts`:

```ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { RequestUser } from '../auth.types';

/** Inject the authenticated user (set by JwtAuthGuard) into a handler param. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    const request = ctx.switchToHttp().getRequest<{ user: RequestUser }>();
    return request.user;
  },
);
```

- [ ] **Step 4: Write the failing guard test.** Create `apps/api/src/auth/guards/jwt-auth.guard.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';

function contextWith(headers: Record<string, string>): ExecutionContext {
  const request = { headers, user: undefined };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  let reflector: Reflector;
  let jwt: { verifyAsync: ReturnType<typeof vi.fn> };
  let guard: JwtAuthGuard;

  beforeEach(() => {
    reflector = new Reflector();
    jwt = { verifyAsync: vi.fn() };
    guard = new JwtAuthGuard(reflector, jwt as unknown as JwtService);
  });

  it('allows public routes without a token', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    expect(await guard.canActivate(contextWith({}))).toBe(true);
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it('rejects a protected route with no Authorization header', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    await expect(guard.canActivate(contextWith({}))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an invalid/expired token', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    jwt.verifyAsync.mockRejectedValue(new Error('expired'));
    await expect(
      guard.canActivate(contextWith({ authorization: 'Bearer bad.token' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts a valid token and attaches the user to the request', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', username: 'ada' });
    const ctx = contextWith({ authorization: 'Bearer good.token' });
    const request = ctx.switchToHttp().getRequest<{ user: unknown }>();

    expect(await guard.canActivate(ctx)).toBe(true);
    expect(request.user).toMatchObject({ id: 'user-1', username: 'ada' });
  });
});
```

- [ ] **Step 5: Run to verify failure.**

Run: `pnpm --filter @repo/api exec vitest run src/auth/guards/jwt-auth.guard.spec.ts`
Expected: FAIL — cannot resolve `./jwt-auth.guard`. (If `@nestjs/jwt` is not yet installed, this also fails to resolve it — it is added in Task 6 Step 1; you may run Task 6 Step 1 first.)

- [ ] **Step 6: Implement the guard.** Create `apps/api/src/auth/guards/jwt-auth.guard.ts`:

```ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { JwtPayload } from '@repo/types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { RequestUser } from '../auth.types';

/**
 * Global guard (registered via APP_GUARD). Routes are protected by default;
 * a `@Public()` route is allowed straight through. Otherwise the `Authorization:
 * Bearer <jwt>` header is verified and the decoded user attached to the request.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: RequestUser;
    }>();
    const token = this.extractToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // The token carries only id + username; full profile fields are not needed
    // to authorize a request, so attach what the claims provide.
    request.user = {
      id: payload.sub,
      username: payload.username,
      email: '',
      firstName: '',
      lastName: '',
    };
    return true;
  }

  private extractToken(header: string | undefined): string | undefined {
    const [type, token] = header?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
```

> Note: `GET /auth/me` needs full profile fields, so its handler re-loads the user from the DB rather than trusting the slim token claims (see Task 7).

- [ ] **Step 7: Run to verify pass.**

Run: `pnpm --filter @repo/api exec vitest run src/auth/guards/jwt-auth.guard.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 8: Commit.**

```bash
git add apps/api/src/auth/auth.types.ts apps/api/src/auth/decorators/ apps/api/src/auth/guards/
git commit -m "feat(api): add JWT guard, @Public and @CurrentUser decorators

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 6 — Auth service, DTOs, controller, module

### Task 6: `AuthService` + DTOs

**Files:**
- Create: `apps/api/src/auth/dto/login.dto.ts`
- Create: `apps/api/src/auth/dto/register.dto.ts`
- Create: `apps/api/src/auth/auth.service.ts`
- Test: `apps/api/src/auth/auth.service.spec.ts`

**Interfaces:**
- Consumes: `UsersService` (Task 4), `hashPassword`/`comparePassword` (Task 3), `JwtService`.
- Produces:
  - `AuthService.login(dto: LoginDto): Promise<AuthResponse>` — throws `UnauthorizedException` on bad credentials.
  - `AuthService.register(dto: RegisterDto): Promise<AuthResponse>` — throws `ConflictException` if username/email taken.
  - `AuthService.toAuthUser(user: User): AuthUser` (helper).

- [ ] **Step 1: Add `@nestjs/jwt`.**

Run (from repo root): `pnpm --filter @repo/api add @nestjs/jwt`
Expected: `@nestjs/jwt` in `apps/api/package.json` dependencies.

- [ ] **Step 2: Login DTO.** Create `apps/api/src/auth/dto/login.dto.ts`:

```ts
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { LoginInput } from '@repo/types';

/** Body for POST /api/auth/login. Validation is intentionally light. */
export class LoginDto implements LoginInput {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  username: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  password: string;
}
```

- [ ] **Step 3: Register DTO.** Create `apps/api/src/auth/dto/register.dto.ts`:

```ts
import { IsEmail, IsNotEmpty, IsString, IsStrongPassword, MaxLength } from 'class-validator';
import type { CreateUserInput } from '@repo/types';

/** Body for POST /api/auth/register. */
export class RegisterDto implements CreateUserInput {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  username: string;

  @IsEmail()
  @MaxLength(200)
  email: string;

  @IsStrongPassword({ minLength: 8, minLowercase: 1, minUppercase: 1, minNumbers: 1, minSymbols: 1 })
  password: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName: string;
}
```

- [ ] **Step 4: Write failing service tests.** Create `apps/api/src/auth/auth.service.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { makeUser } from '../../test/utils/fixtures';
import { hashPassword } from './hashing';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: {
    findByUsername: ReturnType<typeof vi.fn>;
    existsByUsernameOrEmail: ReturnType<typeof vi.fn>;
    createUser: ReturnType<typeof vi.fn>;
  };
  let jwt: { signAsync: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    usersService = {
      findByUsername: vi.fn(),
      existsByUsernameOrEmail: vi.fn(),
      createUser: vi.fn(),
    };
    jwt = { signAsync: vi.fn().mockResolvedValue('signed.jwt.token') };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwt },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  describe('login', () => {
    it('returns a token and safe user for valid credentials', async () => {
      const hash = await hashPassword('Sup3r$ecret');
      usersService.findByUsername.mockResolvedValue(makeUser({ username: 'ada', passwordHash: hash }));

      const result = await service.login({ username: 'ada', password: 'Sup3r$ecret' });

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.user).toMatchObject({ username: 'ada' });
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(jwt.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'ada' }),
      );
    });

    it('throws Unauthorized for an unknown user', async () => {
      usersService.findByUsername.mockResolvedValue(null);
      await expect(service.login({ username: 'nope', password: 'x' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('throws Unauthorized for a wrong password', async () => {
      const hash = await hashPassword('correct-pw');
      usersService.findByUsername.mockResolvedValue(makeUser({ passwordHash: hash }));
      await expect(
        service.login({ username: 'ada', password: 'wrong-pw' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('register', () => {
    const body = {
      username: 'ada',
      email: 'ada@example.com',
      password: 'Sup3r$ecret',
      firstName: 'Ada',
      lastName: 'Lovelace',
    };

    it('creates a user and returns a token', async () => {
      usersService.existsByUsernameOrEmail.mockResolvedValue(false);
      usersService.createUser.mockResolvedValue(makeUser({ username: 'ada' }));

      const result = await service.register(body);

      expect(usersService.createUser).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'ada', email: 'ada@example.com' }),
      );
      // password is hashed, never stored raw
      const arg = usersService.createUser.mock.calls[0][0];
      expect(arg.passwordHash).not.toBe('Sup3r$ecret');
      expect(arg).not.toHaveProperty('password');
      expect(result.accessToken).toBe('signed.jwt.token');
    });

    it('throws Conflict when the username or email is taken', async () => {
      usersService.existsByUsernameOrEmail.mockResolvedValue(true);
      await expect(service.register(body)).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
```

- [ ] **Step 5: Run to verify failure.**

Run: `pnpm --filter @repo/api exec vitest run src/auth/auth.service.spec.ts`
Expected: FAIL — cannot resolve `./auth.service`.

- [ ] **Step 6: Implement.** Create `apps/api/src/auth/auth.service.ts`:

```ts
import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthResponse, AuthUser, JwtPayload } from '@repo/types';
import { User } from '../entities/user.entity';
import { UsersService } from '../users/users.service';
import { comparePassword, hashPassword } from './hashing';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  /** Verify credentials and issue a token, or throw 401. */
  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.users.findByUsername(dto.username);
    if (!user || !(await comparePassword(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid username or password');
    }
    return this.sign(user);
  }

  /** Create a new account (409 if taken) and issue a token. */
  async register(dto: RegisterDto): Promise<AuthResponse> {
    if (await this.users.existsByUsernameOrEmail(dto.username, dto.email)) {
      throw new ConflictException('Username or email is already in use');
    }
    const passwordHash = await hashPassword(dto.password);
    const user = await this.users.createUser({
      username: dto.username,
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      passwordHash,
    });
    return this.sign(user);
  }

  /** Project an entity to the safe public shape — never exposes the hash. */
  toAuthUser(user: User): AuthUser {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  }

  private async sign(user: User): Promise<AuthResponse> {
    const payload: JwtPayload = { sub: user.id, username: user.username };
    const accessToken = await this.jwt.signAsync(payload);
    return { accessToken, user: this.toAuthUser(user) };
  }
}
```

- [ ] **Step 7: Run to verify pass.**

Run: `pnpm --filter @repo/api exec vitest run src/auth/auth.service.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 8: Commit.**

```bash
git add apps/api/src/auth/ apps/api/package.json ../../pnpm-lock.yaml
git commit -m "feat(api): add AuthService with login/register and login/register DTOs

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 7: `AuthController` + `AuthModule` + wire global guard

**Files:**
- Create: `apps/api/src/auth/auth.controller.ts`
- Create: `apps/api/src/auth/auth.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/health.controller.ts`
- Test: `apps/api/src/auth/auth.controller.spec.ts`

**Interfaces:**
- Consumes: `AuthService` (Task 6), `UsersService.findOne` (existing), `@Public`, `@CurrentUser`, `JwtAuthGuard` (Task 5).
- Produces routes: `POST /api/auth/register` (public, 201), `POST /api/auth/login` (public, 200), `GET /api/auth/me` (protected).

- [ ] **Step 1: Write the failing controller test.** Create `apps/api/src/auth/auth.controller.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { makeUser } from '../../test/utils/fixtures';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: { login: ReturnType<typeof vi.fn>; register: ReturnType<typeof vi.fn>; toAuthUser: ReturnType<typeof vi.fn> };
  let usersService: { findOne: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    authService = { login: vi.fn(), register: vi.fn(), toAuthUser: vi.fn((u) => ({ id: u.id, username: u.username })) };
    usersService = { findOne: vi.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();

    controller = moduleRef.get(AuthController);
  });

  it('POST /login delegates to AuthService.login', async () => {
    authService.login.mockResolvedValue({ accessToken: 't', user: { username: 'ada' } });
    const body = { username: 'ada', password: 'pw' };
    expect(await controller.login(body as never)).toEqual({ accessToken: 't', user: { username: 'ada' } });
    expect(authService.login).toHaveBeenCalledWith(body);
  });

  it('POST /register delegates to AuthService.register', async () => {
    authService.register.mockResolvedValue({ accessToken: 't', user: { username: 'ada' } });
    const body = { username: 'ada', email: 'a@b.com', password: 'Sup3r$ecret', firstName: 'A', lastName: 'B' };
    await controller.register(body as never);
    expect(authService.register).toHaveBeenCalledWith(body);
  });

  it('GET /me re-loads the full user and returns the safe view', async () => {
    usersService.findOne.mockResolvedValue(makeUser({ id: 'user-1', username: 'ada' }));
    const result = await controller.me({ id: 'user-1', username: 'ada', email: '', firstName: '', lastName: '' });
    expect(usersService.findOne).toHaveBeenCalledWith('user-1');
    expect(result).toMatchObject({ username: 'ada' });
  });
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `pnpm --filter @repo/api exec vitest run src/auth/auth.controller.spec.ts`
Expected: FAIL — cannot resolve `./auth.controller`.

- [ ] **Step 3: Implement the controller.** Create `apps/api/src/auth/auth.controller.ts`:

```ts
import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { AuthResponse, AuthUser } from '@repo/types';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import type { RequestUser } from './auth.types';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  /** POST /api/auth/register — create an account and return a bearer token. */
  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto): Promise<AuthResponse> {
    return this.auth.register(dto);
  }

  /** POST /api/auth/login — exchange credentials for a bearer token. */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDto): Promise<AuthResponse> {
    return this.auth.login(dto);
  }

  /** GET /api/auth/me — the authenticated user's full profile. */
  @Get('me')
  async me(@CurrentUser() current: RequestUser): Promise<AuthUser> {
    const user = await this.users.findOne(current.id);
    return this.auth.toAuthUser(user);
  }
}
```

- [ ] **Step 4: Create the module.** Create `apps/api/src/auth/auth.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN', '1d') },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, { provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AuthModule {}
```

- [ ] **Step 5: Register the module + make health public.** In `apps/api/src/app.module.ts`, import and add `AuthModule` to `imports`:

```ts
import { AuthModule } from './auth/auth.module';
// ...
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      useFactory: () => buildDataSourceOptions(),
    }),
    UsersModule,
    ClaimsModule,
    AuthModule,
  ],
```

In `apps/api/src/health.controller.ts`, mark the health route `@Public()` (import `Public` from `./auth/decorators/public.decorator`) so the liveness probe needs no token. Example:

```ts
import { Public } from './auth/decorators/public.decorator';
// ...
  @Public()
  @Get('health')
  check() { /* unchanged body */ }
```

- [ ] **Step 6: Run tests + typecheck.**

Run: `pnpm --filter @repo/api exec vitest run src/auth/auth.controller.spec.ts && pnpm --filter @repo/api check-types`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit.**

```bash
git add apps/api/src/auth/auth.controller.ts apps/api/src/auth/auth.module.ts apps/api/src/app.module.ts apps/api/src/health.controller.ts apps/api/src/auth/auth.controller.spec.ts
git commit -m "feat(api): add AuthController, AuthModule and global JWT guard

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 8: Protect existing endpoints (decide public surface) + e2e

**Files:**
- Modify: `apps/api/src/users/users.controller.ts` (if kept public)
- Modify: `apps/api/src/claims/claims.controller.ts` (if kept public)
- Modify: `apps/api/test/app.e2e-spec.ts`
- Create: `apps/api/test/auth.e2e-spec.ts`

**Decision:** Per issue #1 (web redirects unauthenticated users to `/login`), the portal's data endpoints are **protected**. Leave `users` and `claims` controllers **without** `@Public()` so the global guard covers them. Only health + auth/login + auth/register are public.

**Interfaces:**
- Consumes: full app wiring from Task 7.
- Produces: e2e proof that protected routes 401 without a token and 200/201 with one; auth routes behave.

- [ ] **Step 1: Update the existing e2e harness** so its mocked module includes auth and a token can be minted. In `apps/api/test/app.e2e-spec.ts`, the module currently registers only controllers/services. Add the auth pieces so the global guard is active and verify protected routes now require a token. Add to the imports:

```ts
import { JwtModule, JwtService } from '@nestjs/jwt';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
```

In `Test.createTestingModule({...})`, add `JwtModule.register({ secret: 'test-secret', signOptions: { expiresIn: '1h' } })` to a new `imports: [...]` array, add `AuthController` to `controllers`, and add to `providers`:

```ts
        AuthService,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
```

After `app.init()`, mint a token for use in protected-route requests:

```ts
    const jwt = app.get(JwtService);
    authHeader = `Bearer ${await jwt.signAsync({ sub: USER_ID, username: 'ada' })}`;
```

(declare `let authHeader: string;` near the other `let` declarations.)

- [ ] **Step 2: Update existing protected-route requests** in `app.e2e-spec.ts` to send the header, and add a 401 assertion. For example, change a users request to:

```ts
    await request(app.getHttpServer())
      .get('/api/users')
      .set('Authorization', authHeader)
      .expect(200);
```

Add one unauthenticated case:

```ts
  it('rejects protected routes without a token (401)', async () => {
    await request(app.getHttpServer()).get('/api/users').expect(401);
  });
```

- [ ] **Step 3: Run the existing e2e to confirm it passes with tokens.**

Run: `pnpm --filter @repo/api exec vitest run test/app.e2e-spec.ts`
Expected: PASS (existing assertions now send the header; the new 401 case passes).

- [ ] **Step 4: Add a dedicated auth e2e.** Create `apps/api/test/auth.e2e-spec.ts` exercising the real auth controller/service over HTTP with a mocked `UsersService`:

```ts
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
```

- [ ] **Step 5: Run the auth e2e.**

Run: `pnpm --filter @repo/api exec vitest run test/auth.e2e-spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Full API suite + typecheck + lint.**

Run: `pnpm --filter @repo/api test && pnpm check-types && pnpm lint`
Expected: PASS across the board.

- [ ] **Step 7: Commit.**

```bash
git add apps/api/test/app.e2e-spec.ts apps/api/test/auth.e2e-spec.ts apps/api/src/users/users.controller.ts apps/api/src/claims/claims.controller.ts
git commit -m "test(api): protect data endpoints behind JWT guard + auth e2e coverage

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 7 — Seed data expansion

### Task 9: Credentials, demo account, richer data in the seed

**Files:**
- Modify: `apps/api/src/database/seed.ts`

**Interfaces:**
- Consumes: `hashPassword` (Task 3), `User`/`Policy`/`Vehicle`/`Claim` entities.
- Produces: every seeded user has `username` + `passwordHash`; a fixed `demo` account; more claims/docs/notes; 1–3 policies (varied status) and 1–3 vehicles per user.

- [ ] **Step 1: Import the hasher and define shared credentials.** At the top of `apps/api/src/database/seed.ts`, add:

```ts
import { hashPassword } from '../auth/hashing';
import { PolicyStatus } from '@repo/types';
```
(PolicyStatus is already imported — keep a single import.) Then, inside `seed()` before the user loop, hash a shared demo password once (bcrypt is slow; hashing per-user 50× is fine but a shared hash keeps the seed fast and the password known):

```ts
  // Every seeded account shares this password so the data is easy to log into.
  const SEED_PASSWORD = 'Password123!';
  const seedPasswordHash = await hashPassword(SEED_PASSWORD);
  console.log(`🔑 All seeded users share the password: ${SEED_PASSWORD}`);
```

- [ ] **Step 2: Add username + hash when creating each user.** In the `userRepo.create({...})` call, add a deterministic unique username and the hash:

```ts
    const username = faker.internet
      .username({ firstName, lastName })
      .toLowerCase()
      .replace(/[^a-z0-9_.]/g, '');
    const user = await userRepo.save(
      userRepo.create({
        firstName,
        lastName,
        // Suffix with the loop index to guarantee uniqueness across 50 users.
        username: `${username}${u}`,
        email: faker.internet.email({ firstName, lastName }).toLowerCase(),
        passwordHash: seedPasswordHash,
        phone: faker.phone.number({ style: 'national' }),
        addressLine1: faker.location.streetAddress(),
        city: faker.location.city(),
        state: faker.location.state({ abbreviated: true }),
        postalCode: faker.location.zipCode(),
      }),
    );
```

- [ ] **Step 3: Expand vehicles to 1–3.** Change `const numVehicles = faker.number.int({ min: 1, max: 2 });` to:

```ts
    const numVehicles = faker.number.int({ min: 1, max: 3 });
```

- [ ] **Step 4: Multiple policies (1–3) with varied statuses.** Replace the single-policy block (the `const effective = ...` through the `policyRepo.save(...)` producing `policy`) with a loop building an array `policies`, then pick a policy per claim. Use:

```ts
    const POLICY_STATUSES = Object.values(PolicyStatus);
    const numPolicies = faker.number.int({ min: 1, max: 3 });
    const policies: Policy[] = [];
    for (let p = 0; p < numPolicies; p++) {
      const effective = faker.date.past({ years: 2 });
      const expiration = new Date(effective);
      expiration.setFullYear(expiration.getFullYear() + 1);
      policies.push(
        await policyRepo.save(
          policyRepo.create({
            policyNumber: policyNumber(),
            // First policy is always ACTIVE so each user has a usable policy;
            // the rest vary across the full enum to exercise every status.
            status: p === 0 ? PolicyStatus.ACTIVE : pick(POLICY_STATUSES),
            premium: faker.number.float({ min: 900, max: 2400, fractionDigits: 2 }),
            deductible: pick([250, 500, 1000]),
            coverageLimit: pick([50000, 100000, 250000]),
            effectiveDate: effective.toISOString().slice(0, 10),
            expirationDate: expiration.toISOString().slice(0, 10),
            userId: user.id,
          }),
        ),
      );
    }
```

- [ ] **Step 5: More claims, and pick a policy per claim.** Change `const numClaims = faker.number.int({ min: 1, max: 5 });` to `{ min: 3, max: 12 }`. Inside the claim loop add `const policy = pick(policies);` (so `policy.deductible` / `policy.id` still resolve). Change docs `{ min: 1, max: 4 }` → `{ min: 1, max: 6 }` and notes `{ min: 1, max: 3 }` → `{ min: 1, max: 4 }`.

- [ ] **Step 6: Add the fixed demo account** after the user loop (so its username never collides). Before the final `console.log`:

```ts
  const demo = await userRepo.save(
    userRepo.create({
      firstName: 'Demo',
      lastName: 'User',
      username: 'demo',
      email: 'demo@example.com',
      passwordHash: seedPasswordHash,
      phone: faker.phone.number({ style: 'national' }),
      addressLine1: faker.location.streetAddress(),
      city: faker.location.city(),
      state: faker.location.state({ abbreviated: true }),
      postalCode: faker.location.zipCode(),
    }),
  );
  console.log(`\n🎟️  Demo login → username: demo  password: ${SEED_PASSWORD} (id: ${demo.id})`);
```

- [ ] **Step 7: Run the seed against a local DB.**

Run (from repo root, with Postgres up): `pnpm db:seed`
Expected: completes; logs the shared password and the `demo` login; reports 51 users and a higher claim count than before.

- [ ] **Step 8: Typecheck.**

Run: `pnpm --filter @repo/api check-types`
Expected: PASS.

- [ ] **Step 9: Commit.**

```bash
git add apps/api/src/database/seed.ts
git commit -m "feat(api): seed user credentials, demo account, and richer claim/policy data

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 8 — Environment + docs

### Task 10: JWT env vars and README

**Files:**
- Modify: `apps/api/.env` (local, untracked) and `apps/api/.env.example` if present
- Modify: `README.md`

- [ ] **Step 1: Add env vars locally.** In `apps/api/.env`, add:

```
JWT_SECRET=dev-only-change-me-to-a-long-random-string
JWT_EXPIRES_IN=1d
```
If an `apps/api/.env.example` exists, add the same keys with placeholder values there (this file *is* committed).

- [ ] **Step 2: Document in README.** Add a short "Authentication" subsection to `README.md` describing: bearer-token JWT, the `JWT_SECRET` / `JWT_EXPIRES_IN` env vars, the `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` endpoints, and the seeded demo login (`demo` / `Password123!`). Add the three routes to the API endpoint table.

- [ ] **Step 3: Commit** (only committed files).

```bash
git add README.md apps/api/.env.example
git commit -m "docs: document JWT auth env vars, endpoints, and demo login

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

> CI note: `.github/workflows/ci.yml` needs `JWT_SECRET` available when the API boots in tests. Auth unit/e2e tests inject their own secret, so no workflow change is required for the test suite; if any test boots the full `AppModule`, set `JWT_SECRET` in the workflow env. Verify by reading the workflow before finishing this task.

---

## Phase 9 — Web: token plumbing + auth helpers

### Task 11: shadcn `input` + `label` primitives

**Files:**
- Create: `apps/web/src/components/ui/input.tsx`
- Create: `apps/web/src/components/ui/label.tsx`

The forms need text inputs and labels, which aren't in `components/ui` yet. Add the standard shadcn implementations.

- [ ] **Step 1: Add the Radix label dependency.**

Run (from repo root): `pnpm --filter web add @radix-ui/react-label`
Expected: dependency added to `apps/web/package.json`.

- [ ] **Step 2: Create `input.tsx`.** Create `apps/web/src/components/ui/input.tsx`:

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
```

- [ ] **Step 3: Create `label.tsx`.** Create `apps/web/src/components/ui/label.tsx`:

```tsx
'use client';

import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '@/lib/utils';

function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn('text-sm font-medium leading-none', className)}
      {...props}
    />
  );
}

export { Label };
```

- [ ] **Step 4: Typecheck.**

Run: `pnpm --filter web check-types`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/components/ui/input.tsx apps/web/src/components/ui/label.tsx apps/web/package.json ../../pnpm-lock.yaml
git commit -m "feat(web): add shadcn input and label primitives

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 12: Cookie/token helpers + authenticated API client

**Files:**
- Create: `apps/web/src/lib/auth.ts`
- Modify: `apps/web/src/lib/api.ts`

**Interfaces:**
- Produces:
  - `lib/auth.ts`: `ACCESS_TOKEN_COOKIE` constant; `getAccessToken(): Promise<string | undefined>`; `getCurrentUser(): Promise<AuthUser | null>`.
  - `lib/api.ts`: `apiGet` attaches the bearer token; new `loginRequest(input): Promise<AuthResponse>`, `registerRequest(input): Promise<AuthResponse>`, `fetchCurrentUser(token): Promise<AuthUser | null>`.

- [ ] **Step 1: Create `lib/auth.ts`.**

```ts
import { cookies } from 'next/headers';
import type { AuthUser } from '@repo/types';
import { fetchCurrentUser } from './api';

/** Name of the httpOnly cookie holding the JWT access token. */
export const ACCESS_TOKEN_COOKIE = 'access_token';

/** Read the access token from the request cookies (server-side only). */
export async function getAccessToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(ACCESS_TOKEN_COOKIE)?.value;
}

/** The currently signed-in user, or null if there is no/invalid token. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = await getAccessToken();
  if (!token) return null;
  return fetchCurrentUser(token);
}
```

- [ ] **Step 2: Make `apiGet` send the token and add auth requests.** Rewrite `apps/web/src/lib/api.ts` so reads attach the cookie token and add the auth calls:

```ts
import { cookies } from 'next/headers';
import type { AuthResponse, AuthUser, Claim, CreateUserInput, LoginInput, Paginated, User } from '@repo/types';

const API_URL = process.env.API_URL ?? 'http://localhost:4000/api';
const ACCESS_TOKEN_COOKIE = 'access_token';

export type UserWithCount = User & { claimCount: number };
export const USERS_PAGE_SIZE = 12;

/** Authenticated GET: forwards the bearer token from the request cookie. */
async function apiGet<T>(path: string): Promise<T> {
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  const res = await fetch(`${API_URL}${path}`, {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (res.status === 404) return null as T;
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error(`API request failed: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

/** Thrown when the API rejects the token; pages catch this to redirect to /login. */
export class UnauthorizedError extends Error {
  constructor() {
    super('Unauthorized');
    this.name = 'UnauthorizedError';
  }
}

export function getUsers(page = 1, limit = USERS_PAGE_SIZE): Promise<Paginated<UserWithCount>> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  return apiGet<Paginated<UserWithCount>>(`/users?${params}`);
}

export function getUser(id: string): Promise<User | null> {
  return apiGet<User | null>(`/users/${id}`);
}

export function getUserClaims(id: string): Promise<Claim[]> {
  return apiGet<Claim[]>(`/users/${id}/claims`);
}

export function getClaim(id: string): Promise<Claim | null> {
  return apiGet<Claim | null>(`/claims/${id}`);
}

/** POST /auth/login — returns the token + user, or throws on bad credentials. */
export async function loginRequest(input: LoginInput): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  return res.json() as Promise<AuthResponse>;
}

/** POST /auth/register — creates the account and returns the token + user. */
export async function registerRequest(input: CreateUserInput): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const message = res.status === 409 ? 'Username or email already in use' : `Registration failed: ${res.status}`;
    throw new Error(message);
  }
  return res.json() as Promise<AuthResponse>;
}

/** GET /auth/me with an explicit token (used before the cookie context exists). */
export async function fetchCurrentUser(token: string): Promise<AuthUser | null> {
  const res = await fetch(`${API_URL}/auth/me`, {
    cache: 'no-store',
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json() as Promise<AuthUser>;
}
```

- [ ] **Step 3: Typecheck.**

Run: `pnpm --filter web check-types`
Expected: PASS. (Existing pages calling `getUsers`/`getUser` are unaffected — signatures are unchanged.)

- [ ] **Step 4: Commit.**

```bash
git add apps/web/src/lib/api.ts apps/web/src/lib/auth.ts
git commit -m "feat(web): forward JWT cookie on API reads; add auth request helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 10 — Web: login/register UI, logout, middleware, layout

### Task 13: Login page + server action

**Files:**
- Create: `apps/web/src/app/login/actions.ts`
- Create: `apps/web/src/app/login/page.tsx`
- Test: `apps/web/src/app/login/page.spec.tsx`

**Interfaces:**
- Consumes: `loginRequest` (Task 12), `ACCESS_TOKEN_COOKIE` (Task 12).
- Produces: `login(prevState, formData)` server action that sets the cookie and redirects to `/`.

- [ ] **Step 1: Server action.** Create `apps/web/src/app/login/actions.ts`:

```ts
'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth';
import { loginRequest, UnauthorizedError } from '@/lib/api';

export type AuthFormState = { error: string | null };

export async function login(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const username = String(formData.get('username') ?? '');
  const password = String(formData.get('password') ?? '');

  let token: string;
  try {
    const { accessToken } = await loginRequest({ username, password });
    token = accessToken;
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: 'Invalid username or password' };
    return { error: 'Something went wrong. Please try again.' };
  }

  (await cookies()).set(ACCESS_TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24, // 1 day, matching JWT_EXPIRES_IN
  });
  redirect('/');
}
```

- [ ] **Step 2: Login page (client form).** Create `apps/web/src/app/login/page.tsx`:

```tsx
'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { login, type AuthFormState } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';

const initialState: AuthFormState = { error: null };

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <div className="mx-auto max-w-sm py-12">
      <Card className="p-6">
        <h1 className="mb-1 text-xl font-semibold">Sign in</h1>
        <p className="mb-6 text-sm text-muted-foreground">Access the Auto Claims Portal.</p>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input id="username" name="username" autoComplete="username" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <p className="mt-4 text-sm text-muted-foreground">
          No account?{' '}
          <Link href="/register" className="font-medium underline">
            Create one
          </Link>
        </p>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Test the form renders and submits.** Create `apps/web/src/app/login/page.spec.tsx` (mock the action module; assert fields + error render). Follow the existing `apps/web/src/app/page.spec.tsx` Testing-Library + Vitest patterns:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import LoginPage from './page';

vi.mock('./actions', () => ({ login: vi.fn(async () => ({ error: null })) }));

describe('LoginPage', () => {
  it('renders username and password fields', () => {
    render(<LoginPage />);
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run the web test.**

Run: `pnpm --filter web exec vitest run src/app/login/page.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/app/login/
git commit -m "feat(web): add login page and cookie-setting server action

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 14: Register page + server action

**Files:**
- Create: `apps/web/src/app/register/actions.ts`
- Create: `apps/web/src/app/register/page.tsx`
- Test: `apps/web/src/app/register/page.spec.tsx`

- [ ] **Step 1: Server action.** Create `apps/web/src/app/register/actions.ts` — same cookie-setting shape as login, calling `registerRequest`:

```ts
'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth';
import { registerRequest } from '@/lib/api';
import type { AuthFormState } from '../login/actions';

export async function register(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const input = {
    username: String(formData.get('username') ?? ''),
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
    firstName: String(formData.get('firstName') ?? ''),
    lastName: String(formData.get('lastName') ?? ''),
  };

  let token: string;
  try {
    const { accessToken } = await registerRequest(input);
    token = accessToken;
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Registration failed' };
  }

  (await cookies()).set(ACCESS_TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24,
  });
  redirect('/');
}
```

- [ ] **Step 2: Register page.** Create `apps/web/src/app/register/page.tsx` mirroring the login page but with `firstName`, `lastName`, `username`, `email`, `password` fields and the `register` action. (Reuse the same Card/Input/Label/Button structure; password input notes the strength requirement: "8+ chars with upper, lower, number, symbol".)

- [ ] **Step 3: Test.** Create `apps/web/src/app/register/page.spec.tsx` asserting the five fields render (mock `./actions`).

- [ ] **Step 4: Run + commit.**

```bash
pnpm --filter web exec vitest run src/app/register/page.spec.tsx
git add apps/web/src/app/register/
git commit -m "feat(web): add registration page and server action

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 15: Logout route, middleware, auth-aware layout

**Files:**
- Create: `apps/web/src/app/logout/route.ts`
- Create: `apps/web/src/middleware.ts`
- Modify: `apps/web/src/app/layout.tsx`

**Interfaces:**
- Consumes: `ACCESS_TOKEN_COOKIE` (Task 12), `getCurrentUser` (Task 12).

- [ ] **Step 1: Logout route handler** (clears the cookie, redirects to `/login`). Create `apps/web/src/app/logout/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth';

export async function POST(request: Request) {
  (await cookies()).delete(ACCESS_TOKEN_COOKIE);
  return NextResponse.redirect(new URL('/login', request.url));
}
```

- [ ] **Step 2: Middleware** to redirect unauthenticated users away from protected pages. Create `apps/web/src/middleware.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/register'];

/** Gate every page behind a token cookie except the auth pages and assets. */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  const token = request.cookies.get('access_token')?.value;
  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Run on all routes except Next internals, the logout endpoint, and static files.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logout).*)'],
};
```

- [ ] **Step 3: Auth-aware header.** In `apps/web/src/app/layout.tsx`, make `RootLayout` async, fetch the current user, and render their name + a logout button when present. Add to the header (inside the flex container, after the logo `Link`):

```tsx
import { getCurrentUser } from '@/lib/auth';
// ...
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  // ...
            </Link>
            {user ? (
              <div className="ml-auto flex items-center gap-3 text-sm">
                <span className="text-muted-foreground">{user.firstName} {user.lastName}</span>
                <form action="/logout" method="post">
                  <button type="submit" className="font-medium underline">Sign out</button>
                </form>
              </div>
            ) : null}
```

- [ ] **Step 4: Typecheck + web tests.**

Run: `pnpm --filter web check-types && pnpm --filter web test`
Expected: PASS. (Existing page specs may need a `getCurrentUser` mock if they render the layout — add a `vi.mock('@/lib/auth', ...)` where required.)

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/app/logout/ apps/web/src/middleware.ts apps/web/src/app/layout.tsx
git commit -m "feat(web): add logout, auth middleware, and user-aware header

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 16: End-to-end login flow (Playwright) + final verification

**Files:**
- Create: `apps/web/e2e/auth.spec.ts` (or alongside existing Playwright specs — match the existing `test:e2e` layout)

- [ ] **Step 1: Check existing Playwright layout** (`apps/web` — `playwright.config.*`, existing `e2e/` or `tests/` dir) and mirror it. Write a spec that: visits `/` unauthenticated → expects redirect to `/login`; fills the demo credentials (`demo` / `Password123!`); submits; expects the policyholders list on `/`. This requires the API + web running with a seeded DB — gate it the same way existing e2e specs are gated.

- [ ] **Step 2: Run the full verification gate.**

Run (from repo root): `pnpm check-types && pnpm lint && pnpm --filter @repo/api test && pnpm --filter @repo/api test:e2e && pnpm --filter web test`
Expected: PASS across all suites.

- [ ] **Step 3: Verify migration state is clean.**

Run (from `apps/api`, DB up): `pnpm migration:check`
Expected: exit 0 (no drift).

- [ ] **Step 4: Commit.**

```bash
git add apps/web/e2e/
git commit -m "test(web): add Playwright login-flow e2e

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final review checklist (run before opening a PR)

- [ ] `pnpm check-types` — clean (tsgo).
- [ ] `pnpm lint` — clean.
- [ ] `pnpm format:check` — clean (or run `pnpm format`).
- [ ] `pnpm --filter @repo/api test` + `test:e2e` — green.
- [ ] `pnpm --filter web test` + `test:e2e` — green.
- [ ] `pnpm migration:check` — no drift; migration committed with the entity change.
- [ ] No password/hash is logged or returned by any endpoint (`grep` for `passwordHash` in responses/DTOs).
- [ ] README documents auth + the demo login.
- [ ] PR title `[#1] feat: add username/password authentication (JWT)`, body `Closes #1`. **Do not push without explicit confirmation.**

---

## Spec coverage map (issue #1 → tasks)

| Issue requirement | Task(s) |
| --- | --- |
| `username` + `passwordHash` on `User`, `select:false`, indexed | 2 |
| Committed TypeORM migration | 2 |
| `@nestjs/jwt` + `bcrypt` deps | 3, 6 |
| `AuthModule` + `JwtModule.registerAsync` | 7 |
| `AuthService` (validate/login/register) | 6 |
| `AuthController` (`/register`, `/login` 200, `/me`) | 7 |
| `LoginDto`/`RegisterDto` + `@IsStrongPassword` + shared `CreateUserInput` | 1, 6 |
| Global guard + `@Public()` + `@CurrentUser()` | 5, 7, 8 |
| Shared `User`/auth types; hash never leaves API | 1, 6, final checklist |
| Env `JWT_SECRET` / `JWT_EXPIRES_IN` + README | 10 |
| Web login + register pages | 13, 14 |
| httpOnly cookie via Server Action; bearer in `lib/api.ts` | 12, 13, 14 |
| `lib/api.ts` login/register/getCurrentUser/logout + 401 handling | 12, 15 |
| Auth-aware layout + redirect unauthenticated | 15 |
| Seed: credentials for every user | 9 |
| Seed: known demo account | 9 |
| Seed: more claims & sub-records | 9 |
| Seed: more vehicles & policies (full enum range) | 9 |
| Tests: unit (service/guard), controller/DTO, e2e, web | 3, 5, 6, 7, 8, 13, 14, 16 |
