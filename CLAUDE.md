# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workflow conventions

- **Track work as GitHub issues, then implement it in an issue-numbered worktree → PR.** Document each feature/bug as a GitHub issue first; the issue number prefixes the worktree, branch, and PR title (see [Issue → worktree → PR workflow](#issue--worktree--pr-workflow)).
- **Develop new features in a git worktree, not a plain branch.** Create an isolated worktree per feature/task (kept under `.claude/worktrees/`) instead of switching branches in the main checkout — keeps parallel work isolated and the main checkout clean.
- **Always ask before pushing to the remote.** Never run `git push` (branches or tags) without explicit confirmation in this conversation — even when changes are committed, CI-green, and tests pass. Committing locally is fine.
- **Changing a TypeORM entity? Generate and commit a migration in the same change.** Dev uses `synchronize`, so entity edits work locally without one — but CI fails if a migration is missing (see [Database & migrations](#database--migrations)).
- **Run scripts from the repo root.** Turborepo fans tasks out to the workspaces and builds `@repo/types` first; running an app script in isolation can use stale shared types.

### Issue → worktree → PR workflow

Work is tracked as GitHub issues (Issues are enabled on the repo; no Jira). Each feature request or bug is documented as an issue, then implemented on an isolated branch that traces back to it. **The issue number is the leading prefix** for both the worktree/branch name and the PR title, so any worktree, branch, or PR is identifiable at a glance.

| Artifact              | Convention                                                                  | Example (issue #42)                                                           |
| --------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Issue                 | Created from a template in `.github/ISSUE_TEMPLATE/` (`feat:`/`fix:` title) | `#42 feat: fuzzy search on claims list`                                       |
| Worktree dir + branch | `<issue#>-<kebab-slug>`, worktree under `.claude/worktrees/`                | `.claude/worktrees/42-fuzzy-claims-search` on branch `42-fuzzy-claims-search` |
| PR title              | `[#<issue#>] <type>: <summary>` (`<type>` = conventional-commit type)       | `[#42] feat: fuzzy search on claims list`                                     |
| PR body               | Includes a closing keyword so merge auto-closes the issue                   | `Closes #42`                                                                  |

```bash
# 1. Document the work as an issue (prints the issue number/URL)
gh issue create --title "feat: fuzzy search on claims list" --body "..." --label enhancement

# 2. Spin up an issue-numbered worktree (from repo root)
git worktree add .claude/worktrees/42-fuzzy-claims-search -b 42-fuzzy-claims-search

# 3. Implement, then raise the PR — title prefixed with [#42], body closes the issue
gh pr create --base main \
  --title "[#42] feat: fuzzy search on claims list" \
  --body "Closes #42

## What changed
..."
```

`.github/pull_request_template.md` pre-fills the `Closes #` line and a checklist enforcing the prefixes. Pushing the branch / opening the PR still requires explicit confirmation (see the push rule above).

## Subagent model selection

When dispatching subagents (e.g. during subagent-driven development), **default to the same model the main execution is using** — match the parent. Only **downgrade one step for very basic tasks** (single-file or mechanical changes, complete code already specified, transcription + tests).

- **Default (matches main):** if the main loop is on **opus**, dispatch implementer/reviewer subagents on **opus**.
- **Very basic task → downgrade one step:** opus → **sonnet** (sonnet → **haiku** only if the main loop is already on sonnet).

This overrides the generic "use the cheapest model that works" heuristic. When in doubt, match the parent rather than downgrade — a task is only "very basic" when the work is mechanical and fully specified.

## Project overview

pnpm + Turborepo monorepo (`auto-claims-monorepo`) — an auto insurance claims portal for browsing claims by policyholder.

| Workspace                    | Package                   | Stack                                                                                                                                              |
| ---------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api`                   | `@repo/api`               | NestJS + TypeORM over PostgreSQL 17 (REST, base path `/api`, port `4000`)                                                                          |
| `apps/web`                   | `web`                     | Next.js (App Router, RSC) + Tailwind v4 + shadcn/ui (port `3000`)                                                                                  |
| `packages/types`             | `@repo/types`             | Shared domain enums + types (`ClaimStatus`, `ClaimType`, `FaultDetermination`, `PolicyStatus`, `DocumentType`, `CreateClaimInput`, `Paginated`, …) |
| `packages/eslint-config`     | `@repo/eslint-config`     | Shared flat ESLint presets (`base`, `nest`, `next`)                                                                                                |
| `packages/typescript-config` | `@repo/typescript-config` | Shared `tsconfig` presets (`base`, `nestjs`, `nextjs`, `library`)                                                                                  |

`@repo/types` is the contract between API and web — both import its enums/types, so a domain change lives in one place and should start there. The enums double as TS types and TypeORM `@Column({ type: 'enum', enum: ... })` definitions. Turbo's `dependsOn: ["^build"]` guarantees `@repo/types` builds before either app.

See `README.md` for product details (data model, full API endpoint table, DB setup walkthrough).

## Commands

Run from the repo root unless noted; add `--filter @repo/api` / `--filter web` to scope.

```bash
pnpm dev            # API (:4000/api) + web (:3000) in watch mode; builds @repo/types first
pnpm build          # build all workspaces
pnpm lint           # ESLint across workspaces       (lint:fix to autofix)
pnpm check-types    # typecheck via tsgo              (NOT tsc — see Tooling)
pnpm format         # Prettier write                 (format:check to verify)
pnpm db:seed        # reset & seed: 50 users, vehicles, policies, ~150 claims
pnpm clean          # remove build artifacts + node_modules
```

First run needs a running **PostgreSQL** with a matching role+db and `apps/api/.env` (the API reads `DB_*`; defaults in `database/typeorm.config.ts`). The web app reads `API_URL` from `apps/web/.env.local`. See README for the fresh-clone setup steps.

### Tests

```bash
# API (apps/api) — Vitest
pnpm --filter @repo/api test         # unit + integration (mocked TypeORM repos, no DB)
pnpm --filter @repo/api test:e2e     # boot Nest + supertest over HTTP (repos mocked, no Postgres)
pnpm --filter @repo/api exec vitest run path/to/file.spec.ts   # single file
pnpm --filter @repo/api exec vitest run -t "test name"         # single test

# Web (apps/web)
pnpm --filter web test               # Vitest + Testing Library (jsdom), MSW for network mocks
pnpm --filter web exec playwright install   # one-time: browsers, before the first e2e run
pnpm --filter web test:e2e           # Playwright (test:e2e:ui for the runner UI)
```

API tests are transpiled with **SWC** (`apps/api/.swcrc`, via `unplugin-swc`), not esbuild/Oxc — NestJS DI relies on `emitDecoratorMetadata`, which esbuild/Oxc (vitest's default) don't emit. Keep this in mind before touching test build config.

## Tooling conventions

- **Typecheck with `tsgo`** (`@typescript/native-preview`, TS v7 native preview), not `tsc` — `pnpm check-types` runs `tsgo --noEmit`. Builds still use real `tsc` (`nest build`, `@repo/types`' `tsc -p`). Since tsgo and the build share one tsconfig, options must satisfy both: configs are `nodenext`/bundler-based and must **not** reintroduce `baseUrl` or `moduleResolution: node10` (TS7 removed them).
- **ESLint** is flat-config v10 in the shared `@repo/eslint-config` (`base.mjs` → `nest.mjs` / `next.mjs`). `eslint-config-prettier` is applied **last**, so formatting is owned entirely by Prettier — don't add stylistic ESLint rules. Test files (`*.{test,spec}.*`, `test/`, `__tests__/`) are allowed `any` and non-null assertions. Note: `eslint-plugin-react@7.37.5` isn't fully v10-compatible, so `@repo/eslint-config/next` pins `settings.react.version` to `"19.0"` (not `"detect"`) to avoid a crash — revisit if bumping React or that plugin.
- **Prettier** (`.prettierrc.json`): single quotes, semicolons, trailing commas (`all`), `printWidth: 100`, 2-space tabs, LF. Config + ignore live at the repo root and apply across packages.
- **TypeScript** (`@repo/typescript-config`): NestJS uses `nodenext` module/resolution, `emitDecoratorMetadata`, `strictNullChecks`, `noImplicitAny`, with `strictPropertyInitialization: false` (entities/DTOs declare fields without initializers).
- **Node** `lts/*` via nvm (`nvm use`, `.nvmrc`); **pnpm** `11.7.0` via `corepack enable`.

## API conventions (`apps/api/src`)

Feature modules (`claims/`, `users/`) follow **controller → service → TypeORM repository**. `app.module.ts` wires the modules plus a global `ConfigModule` and `TypeOrmModule.forRootAsync` built from `database/typeorm.config.ts`.

- **Controllers are thin** — delegate straight to the service, no business logic. `@Param('id', ParseUUIDPipe)` on every id (malformed ids → 400); one JSDoc line per route in `METHOD /api/path — description` form.
- **Services** hold the logic. Repositories are constructor-injected via `@InjectRepository(Entity)`; inject `DataSource` for transactions. Throw `NotFoundException` / `BadRequestException` (mapped to 404/400). Load relations with the object form (`relations: { user: true, vehicle: true }`).
- **DTOs** (`<module>/dto/`) `implements` the shared input type from `@repo/types` (e.g. `CreateClaimDto implements CreateClaimInput`) and validate with `class-validator` decorators (`@IsUUID`, `@IsEnum`, `@IsOptional`, `@Min`, …).
- **Entities** (`entities/`, not co-located with modules): UUID PKs (`@PrimaryGeneratedColumn('uuid')`), `snake_case` DB columns via `@Column({ name: '…' })` mapping to camelCase TS props, enums from `@repo/types`, `timestamptz` dates, `@Index` on looked-up columns. `Claim` is the hub (→ `User`, `Vehicle`, `Policy`, `ClaimDocument`, `ClaimNote`). `numeric` money columns use `numericTransformer` (`common/numeric.transformer.ts`) so they surface as JS `number`, not string — use it for any new money column.
- **Pagination**: list endpoints return the `Paginated<T>` envelope (`{ data, meta }`); see `common/pagination*`. Default `limit` 12, max 100.
- **`common/`** holds cross-cutting helpers (pagination DTO/envelope, numeric transformer). **`database/`** holds `data-source.ts` (TypeORM CLI DataSource), `typeorm.config.ts` (`buildDataSourceOptions()`, shared by the Nest app and standalone seed/migration scripts), and `seed.ts`.
- **Bootstrap** (`main.ts`): global `api` prefix, CORS from `CORS_ORIGIN`, and a global `ValidationPipe` with `whitelist + forbidNonWhitelisted + transform` (implicit conversion on) — extra body/query fields are rejected, query/param strings are coerced to typed DTOs.

Test layers: **service unit** (`*.service.spec.ts`, mocked repos) · **controller & DTO** (routing/delegation + `class-validator` rules) · **e2e** (`test/*.e2e-spec.ts`, supertest, repos mocked → no Postgres). Shared fixtures live in `apps/api/test/utils/`.

## Web conventions (`apps/web/src`)

- Pages under `app/` (`/`, `/users/:id`, `/claims/:id`) are **React Server Components** that fetch the API directly — no client-side data store; data flows API → RSC → markup.
- All fetching goes through the typed helpers in `lib/api.ts` (`apiGet` wrapper: base URL from `API_URL`, `cache: 'no-store'`, `404 → null`). Add new endpoints here rather than calling `fetch` inline.
- UI is shadcn/ui primitives in `components/ui` + Tailwind v4; import alias is `@/`. `lib/format.ts` / `lib/utils.ts` hold formatting and `cn`-style helpers.

## Database & migrations

Schema is defined by the TypeORM entities in `apps/api/src/entities`; how it reaches the DB depends on `DB_SYNCHRONIZE`:

| Environment        | `DB_SYNCHRONIZE` | Schema applied by                        |
| ------------------ | ---------------- | ---------------------------------------- |
| Local dev          | `true`           | auto-sync from entities on startup       |
| Builds / prod / CI | `false`          | committed migrations via `migration:run` |

> ⚠️ `synchronize` **can DROP columns/tables** to match entities — only safe locally because data is disposable (`pnpm db:seed`). Never enable it against data you care about.

Because dev auto-syncs, an entity change works locally with no migration — so **every entity change needs a committed migration** (run from `apps/api`, or prefix `pnpm --filter @repo/api`):

```bash
pnpm migration:generate src/migrations/<Name>   # diff entities vs a LIVE db → new migration
pnpm migration:run                              # apply pending migrations
pnpm migration:revert                           # roll back the latest
pnpm migration:show                             # list + applied state
pnpm migration:check                            # non-zero if entities drifted (CI gate)
```

Workflow: generate → **review the SQL** (watch for unintended drops / table locks) → commit the migration alongside the entity change.

**CI** (`.github/workflows/ci.yml`) spins up an empty Postgres 17, builds the schema from committed migrations (`migration:run`), then runs `migration:check` — the build **fails** if entities require an uncommitted migration — and finally the API test suite.
