import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { USER_SEARCH_EXPR } from './users.service';

/**
 * Drift guard: the runtime fuzzy search ranks on USER_SEARCH_EXPR, and the GIN
 * trigram index in AddPolicyholderSearchIndex must index that EXACT bare
 * expression or Postgres silently stops using the index. The migration repeats
 * the literal (migrations must be self-contained), so we assert here that the
 * two never drift apart.
 */
describe('USER_SEARCH_EXPR', () => {
  const migrationsDir = join(__dirname, '../migrations');
  const migrationFile = readdirSync(migrationsDir).find((f) =>
    f.endsWith('AddPolicyholderSearchIndex.ts'),
  );
  const migrationText = readFileSync(join(migrationsDir, migrationFile!), 'utf8');

  it('locates the AddPolicyholderSearchIndex migration', () => {
    expect(migrationFile).toBeDefined();
  });

  it('is indexed verbatim by the GIN trigram migration', () => {
    expect(migrationText.includes(USER_SEARCH_EXPR)).toBe(true);
  });

  it('qualifies to the exact alias form used at runtime', () => {
    const qualified = USER_SEARCH_EXPR.replace(
      /first_name|last_name|email|phone/g,
      (col) => `user.${col}`,
    );
    expect(qualified).toBe(
      "user.first_name || ' ' || user.last_name || ' ' || user.email || ' ' || COALESCE(user.phone, '')",
    );
  });
});
