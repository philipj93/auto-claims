# Fuzzy policyholder search — design

**Date:** 2026-06-17
**Status:** Approved (pending spec review)

## Problem

Staff need to find a policyholder quickly, often from imperfect input — a
misheard name ("Stevn"), a partially remembered email, a phone number, or a
policy number they have in hand. The API today exposes only a paginated
`GET /api/users` list with no search, so locating one person means paging or
filtering client-side.

In this domain a **policyholder is a `User`** (`apps/api/src/entities/user.entity.ts`).

## Goal

Add typo-tolerant ("fuzzy") server-side search to the existing users list so a
single query resolves the right policyholder, ranked best-match-first, without
changing the response contract for existing callers.

## Non-goals

- A separate typeahead/autocomplete endpoint (YAGNI until a UI drives it).
- Fuzzy matching on addresses (adds noise and index size; excluded by choice).
- Search across claims, vehicles, or other entities.

## Matching technique

Use Postgres's **`pg_trgm`** extension for trigram similarity — this is what
makes the search typo-tolerant (e.g. "Stevn" → "Steven", "jonson" → "Johnson").

- **Fuzzy fields** — `first_name`, `last_name`, `email`, `phone`.
  Build a searchable expression and rank by trigram **word similarity**:

  ```
  word_similarity(
    :q,
    first_name || ' ' || last_name || ' ' || email || ' ' || coalesce(phone, '')
  )
  ```

  > **Why `word_similarity`, not `similarity`** (validated against a live DB during
  > implementation): plain `similarity()` compares the query's trigrams against the
  > *entire* concatenated string, so a short query is diluted by the rest of the blob —
  > an exact last-name search scored only `0.222`, **below** the `0.3` threshold, and
  > returned nothing. `word_similarity(query, text)` is asymmetric: it scores the query
  > against the best-matching *substring* of the text (exact last name → `1.000`, a
  > one-character typo → `0.750`, unrelated junk → `0.000`). The query term is the
  > **first** argument. The same GIN trigram index accelerates it via the `%>`
  > operator (confirmed with `EXPLAIN`), so no index change is needed.

- **Policy number** — exact/prefix match via a join to `policies`
  (`policy_number ILIKE :q || '%'`). Policy numbers are structured identifiers,
  so fuzzy matching there adds noise. A policy-number hit is treated as a strong
  match and floated to the top of the results.

- A `WHERE` filter keeps only rows above a **word-similarity threshold** OR with a
  policy-number hit, so we never return the whole table for a query.
  Threshold starts at `0.3` (a recall-leaning floor — typos score ~`0.75`) and is a
  single named constant in the service so it is easy to tune.

- **Ordering:** match score `DESC`, then existing `last_name ASC, first_name ASC`
  as a stable tiebreaker. A policy-number prefix hit scores above any word-similarity
  match so exact identifier lookups always win.

### Query shape (illustrative)

```sql
SELECT u.*, ... , <score> AS match_score
FROM users u
LEFT JOIN policies p ON p.user_id = u.id AND p.policy_number ILIKE :q || '%'
WHERE p.id IS NOT NULL
   OR word_similarity(:q, <search_expr>) >= :threshold
ORDER BY match_score DESC, u.last_name ASC, u.first_name ASC
```

The real implementation uses TypeORM's query builder; `claimCount` is attached
exactly as the existing `findAll` does (a second grouped count restricted to the
ids on the page), so the response shape is untouched. The policies join uses
`DISTINCT`/grouping so a holder with multiple matching policies is not
duplicated.

## API contract

- `GET /api/users?search=stevn&page=1&limit=12`
- Extend the query DTO with an optional `search`:
  - New `FindUsersQueryDto extends PaginationQueryDto` (keeps `PaginationQueryDto`
    reusable elsewhere).
  - `@IsOptional() @IsString() @MaxLength(100) @Transform(trim) search?: string`.
- **Empty / whitespace `search`** → identical to today's behavior: the existing
  ordered, paginated list. No behavior change for existing callers.
- **Response shape unchanged:** `Paginated<UserWithCount>`. Each result still
  carries `claimCount`. Pagination `total`/metadata reflect the filtered count.
- `match_score` is an internal ranking column and is **not** added to the
  response payload.

## Index & migration

Per the project convention (synchronize in dev, migrations in prod; one
committed migration per schema change — see memory `db-schema-migration-convention`):

- Hand-written migration that runs:
  - `CREATE EXTENSION IF NOT EXISTS pg_trgm`
  - A **GIN trigram index** covering the searchable name/email columns
    (e.g. `USING gin ((first_name || ' ' || last_name || ' ' || email) gin_trgm_ops)`)
    so similarity queries stay fast as the table grows.
- **Known caveat:** a `gin_trgm_ops` expression index cannot be expressed in
  TypeORM entity metadata, and `pg_trgm` is an extension (untracked by the schema
  diff, like the existing `uuid-ossp`). During implementation, verify
  `pnpm --filter @repo/api migration:check` stays green after adding the
  migration. If the drift check flags the index, keep it migration-only and
  exclude it from the check rather than weakening the search. Functional
  correctness does not depend on the index (queries fall back to a scan in dev
  under `synchronize`); the index is a performance concern only.

## Testing

- **Unit** (`users.service.spec.ts`): the search branch vs. the no-search branch,
  input trimming, that the threshold filter and ranking are applied, and that an
  empty/whitespace search delegates to the existing list path.
- **E2e** (`test/`): seed a handful of users + a policy, then assert:
  - `?search=` with a deliberate typo returns the intended policyholder ranked
    first.
  - a policy-number query resolves its holder.
  - no `search` returns the unchanged paginated list.

## Affected files

- `apps/api/src/common/pagination.dto.ts` — unchanged; new DTO extends it.
- `apps/api/src/users/dto/find-users-query.dto.ts` — **new**.
- `apps/api/src/users/users.controller.ts` — accept `FindUsersQueryDto`.
- `apps/api/src/users/users.service.ts` — `findAll` gains a search branch (or a
  private `search()` helper) building the trigram query.
- `apps/api/src/migrations/<ts>-AddPolicyholderSearchIndex.ts` — **new**.
- `apps/api/src/users/users.service.spec.ts` + e2e spec — coverage above.
```