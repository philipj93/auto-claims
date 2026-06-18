# Auto Insurance Claims Portal

A full-stack system for viewing auto insurance claims by policyholder.

- **Backend** — NestJS + TypeORM over PostgreSQL
- **Frontend** — Next.js (App Router) + TypeScript + Tailwind CSS v4 + shadcn/ui
- **Monorepo** — pnpm workspaces + Turborepo, with a shared `@repo/types` package

```
.
├── apps
│   ├── api          # NestJS API (TypeORM, PostgreSQL)
│   └── web          # Next.js frontend
├── packages
│   └── types        # Shared domain types/enums (used by api + web)
├── turbo.json
└── pnpm-workspace.yaml
```

## Prerequisites

- **Node.js** (LTS) via [nvm](https://github.com/nvm-sh/nvm) — run `nvm use` in the repo (see `.nvmrc`)
- **pnpm** — `corepack enable`
- **PostgreSQL 17** running locally

## Data model

A claim is the center of the schema, linked to the people and assets around it:

- **User** — the policyholder (name, contact, address)
- **Vehicle** — vehicles owned by a user (make/model/year, VIN, plate)
- **Policy** — an insurance policy (number, status, premium, deductible, coverage limit, term)
- **Claim** — the claim itself: number, status, type, fault determination, incident/reported
  dates, location, description, estimated/approved amounts, deductible, injury flag, police
  report #, adjuster
- **ClaimDocument** — attachments (photos, police reports, estimates, invoices)
- **ClaimNote** — adjuster activity / timeline notes

Enums (`ClaimStatus`, `ClaimType`, `FaultDetermination`, `PolicyStatus`, `DocumentType`)
live in `@repo/types` and are shared by the API and the web app.

## Setup

### 1. Database

The API expects a PostgreSQL database. Defaults (override in `apps/api/.env`):

| Setting  | Value         |
| -------- | ------------- |
| host     | `localhost`   |
| port     | `5432`        |
| database | `claims_db`   |
| user     | `claims_user` |
| password | `claims_pass` |

To create them locally (matching the defaults):

```bash
createdb claims_db                                          # or via psql
psql -d postgres -c "CREATE ROLE claims_user LOGIN PASSWORD 'claims_pass';"
psql -d postgres -c "ALTER DATABASE claims_db OWNER TO claims_user;"
```

> **Schema management — read before changing an entity.**
> This project uses **`synchronize` in dev, migrations for builds/prod** (see
> [Database schema & migrations](#database-schema--migrations)):
>
> - **Local dev:** `DB_SYNCHRONIZE=true` auto-creates/updates the schema from the entities on
>   startup. Convenient, but it can DROP columns/tables to match entities — **never enable it
>   in builds/prod.**
> - **Builds / prod / CI:** `DB_SYNCHRONIZE=false` + `pnpm migration:run`.
>
> ⚠️ **The discipline this relies on:** because dev uses `synchronize`, entity changes are
> picked up locally *without* a migration — so it's easy to ship an entity change with no
> matching migration. Every time you change an entity, also **generate and commit a migration**
> (`pnpm --filter @repo/api migration:generate src/migrations/<Name>`). **CI enforces this**: the
> `api` workflow applies the committed migrations to an empty database and fails if the entities
> would need a migration that isn't committed (see
> [Database schema & migrations](#database-schema--migrations)).

### 2. Install & configure

```bash
pnpm install
cp apps/api/.env.example apps/api/.env     # already present; edit if needed
```

### 3. Seed sample data

Loads 50 policyholders with vehicles, policies, and ~150 claims (documents + notes):

```bash
pnpm db:seed
```

### 4. Run everything

```bash
pnpm dev
```

- Web → http://localhost:3000
- API → http://localhost:4000/api

`turbo` builds the shared `@repo/types` package first, then runs both apps in watch mode.

## Database schema & migrations

The schema is defined by the TypeORM entities in `apps/api/src/entities`. How that schema
reaches the database depends on the environment (set via `DB_SYNCHRONIZE`):

| Environment        | `DB_SYNCHRONIZE` | How schema is applied                          |
| ------------------ | ---------------- | ---------------------------------------------- |
| Local dev          | `true`           | Auto-synced from entities on app startup       |
| Builds / prod / CI | `false`          | Explicit migrations via `pnpm migration:run`   |

> ⚠️ **`synchronize` can DROP columns/tables** to make the DB match the entities. It's only safe
> because local data is disposable (regenerate with `pnpm db:seed`). Never turn it on against a
> database whose data you care about.

### Working with migrations

Run from `apps/api` (or prefix with `pnpm --filter @repo/api`):

| Command                                        | What it does                                                  |
| ---------------------------------------------- | ------------------------------------------------------------ |
| `pnpm migration:generate src/migrations/<Name>`| Diff entities against the DB and write a new migration file   |
| `pnpm migration:run`                           | Apply all pending migrations                                  |
| `pnpm migration:revert`                        | Roll back the most recently applied migration                 |
| `pnpm migration:show`                          | List migrations and whether each has run (`[X]` / `[ ]`)      |
| `pnpm migration:create src/migrations/<Name>`  | Create an empty migration to hand-write                       |
| `pnpm migration:check`                         | Exit non-zero if entities have drifted from migrations (CI)  |

`migration:generate` diffs against a **live** database, so point it at an empty one to capture a
full schema, or at your current one to capture just the latest entity change.

### ⚠️ The habit that keeps dev and prod in sync

Because dev runs with `synchronize`, **your entity changes work locally without a migration** —
which makes it easy to ship a change that has no migration behind it and only breaks on deploy.
So, every time you change an entity:

1. Generate a migration: `pnpm --filter @repo/api migration:generate src/migrations/<Name>`
2. Review the generated SQL (watch for unintended drops / table locks).
3. **Commit the migration file alongside the entity change.**

> **Enforced by CI.** [`.github/workflows/ci.yml`](.github/workflows/ci.yml) spins up an empty
> Postgres, runs `migration:run` to build the schema from committed migrations, then runs
> `migration:check` (`migration:generate --check`) which **fails the build** if the entities
> would require a migration that isn't committed. So a forgotten migration is caught in PR, not
> in production. You can run the same check locally against a throwaway DB:
>
> ```bash
> createdb claims_db_check
> DB_NAME=claims_db_check DB_SYNCHRONIZE=false \
>   pnpm --filter @repo/api exec sh -c 'pnpm migration:run && pnpm migration:check'
> ```

## API endpoints

Base URL: `http://localhost:4000/api`

| Method  | Path                  | Description                                              |
| ------- | --------------------- | ------------------------------------------------------- |
| `GET`   | `/health`             | Health check                                            |
| `GET`   | `/users`              | List policyholders (with claim counts); paginate via `?page=&limit=` |
| `GET`   | `/users/:id`          | A policyholder with vehicles & policies                 |
| `GET`   | `/users/:id/claims`   | All claims for a policyholder (with vehicle)            |
| `GET`   | `/claims`             | List claims; filter via `?userId=&status=&type=`        |
| `GET`   | `/claims/:id`         | Full claim detail (user, vehicle, policy, docs, notes)  |
| `POST`  | `/claims`             | File a new claim                                        |
| `PATCH` | `/claims/:id/status`  | Update a claim's status (+ approved amount / adjuster)  |

Requests are validated with `class-validator`; unknown claims return `404`, malformed
ids/filters return `400`.

Example:

```bash
curl "http://localhost:4000/api/users?page=2&limit=12"
curl "http://localhost:4000/api/claims?status=PAID"
```

`/users` returns a paginated envelope — the page of rows plus the metadata
needed to render page controls:

```jsonc
{
  "data": [ /* … users with claimCount … */ ],
  "meta": {
    "page": 2,
    "limit": 12,
    "total": 50,
    "totalPages": 5,
    "hasPreviousPage": true,
    "hasNextPage": true
  }
}
```

`page` defaults to `1` and `limit` to `12` (max `100`); invalid values return `400`.

## Frontend

- **`/`** — paginated grid of policyholders (`?page=`), each showing their claim count
- **`/users/:id`** — policyholder profile + a table of their claims
- **`/claims/:id`** — full claim detail: incident info, financials, vehicle, policy,
  documents, and an activity timeline

Pages are React Server Components that fetch directly from the API (`API_URL` in
`apps/web/.env.local`).

## Useful scripts

| Command         | What it does                                  |
| --------------- | --------------------------------------------- |
| `pnpm dev`      | Run API + web in watch mode                   |
| `pnpm build`    | Build all packages                            |
| `pnpm db:seed`  | Reset & seed the database                     |
| `pnpm clean`    | Remove build artifacts and `node_modules`     |

Database migrations live in `apps/api` — see
[Database schema & migrations](#database-schema--migrations) (`pnpm --filter @repo/api migration:*`).

## Testing (API)

The API is tested with [Vitest](https://vitest.dev). Because NestJS relies on
`emitDecoratorMetadata` for dependency injection (which esbuild/Oxc don't emit),
tests are transpiled with SWC via `unplugin-swc` (config in `apps/api/.swcrc`).

The suite has three layers:

- **Service unit tests** (`*.service.spec.ts`) — business logic with mocked
  TypeORM repositories (no database).
- **Controller & DTO tests** — routing/delegation and `class-validator` rules.
- **E2E tests** (`apps/api/test/*.e2e-spec.ts`) — boot the Nest app and drive it
  over HTTP with supertest, exercising the global `ValidationPipe`, `ParseUUIDPipe`,
  and exception→status mapping. Repositories are mocked, so no Postgres is needed.

Run from `apps/api`:

| Command            | What it does                          |
| ------------------ | ------------------------------------- |
| `pnpm test`        | Unit/integration tests                |
| `pnpm test:watch`  | Watch mode                            |
| `pnpm test:cov`    | Tests + coverage report               |
| `pnpm test:e2e`    | HTTP end-to-end tests                  |
