import { vi } from 'vitest';
import type { UserSession } from '../../src/entities/user-session.entity';

/**
 * Stateful in-memory stand-in for the `UserSession` repository. Implements just
 * the methods `SessionService` calls (create/save/findOne/delete), so the full
 * rotate / reuse / logout flow runs over HTTP without Postgres. `_rows` is
 * exposed for assertions and cleanup between tests.
 */
export function inMemorySessionRepo() {
  const rows = new Map<string, UserSession>();
  let seq = 0;
  return {
    create: (dto: Partial<UserSession>) => dto,
    save: vi.fn(async (s: UserSession) => {
      if (!s.id) s.id = `sess-${++seq}`;
      rows.set(s.id, { ...s });
      return s;
    }),
    findOne: vi.fn(async ({ where: { id } }: { where: { id: string } }) => {
      const row = rows.get(id);
      return row ? { ...row } : null;
    }),
    delete: vi.fn(async (criteria: { id?: string; userId?: string }) => {
      if (criteria.id) {
        rows.delete(criteria.id);
      } else if (criteria.userId) {
        for (const [key, value] of rows) {
          if (value.userId === criteria.userId) rows.delete(key);
        }
      }
      return { affected: 1, raw: [] };
    }),
    _rows: rows,
  };
}
