import { describe, expect, it } from 'vitest';
import { ClaimStatus, ClaimType } from '@repo/types';
import {
  CLAIMS_LIST_NS,
  USERS_LIST_NS,
  claimsListKey,
  usersListKey,
  everythingIn,
} from './cache.keys';

// The key builders are the correctness-critical core of the cache: two distinct
// queries that collide on one key would serve one request's data for another.
describe('cache.keys', () => {
  describe('claimsListKey', () => {
    it('is stable for the same filters', () => {
      const q = { userId: 'u1', status: ClaimStatus.PAID, type: ClaimType.THEFT };
      expect(claimsListKey(q)).toBe(claimsListKey({ ...q }));
    });

    it('lives in the claims namespace', () => {
      expect(claimsListKey({})).toContain(CLAIMS_LIST_NS);
    });

    it('produces a different key for each differing filter', () => {
      const base = claimsListKey({});
      const byUser = claimsListKey({ userId: 'u1' });
      const byStatus = claimsListKey({ status: ClaimStatus.PAID });
      const byType = claimsListKey({ type: ClaimType.THEFT });

      const keys = [base, byUser, byStatus, byType];
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('treats an omitted filter the same as undefined (normalized to null)', () => {
      expect(claimsListKey({ userId: 'u1' })).toBe(
        claimsListKey({ userId: 'u1', status: undefined, type: undefined }),
      );
    });

    it('does not collide a userId filter with a same-valued status filter', () => {
      expect(claimsListKey({ userId: 'x' })).not.toBe(
        claimsListKey({ status: 'x' as ClaimStatus }),
      );
    });
  });

  describe('usersListKey', () => {
    it('is stable for the same query', () => {
      const q = { search: 'ada', page: 2, limit: 12 };
      expect(usersListKey(q)).toBe(usersListKey({ ...q }));
    });

    it('lives in the users namespace', () => {
      expect(usersListKey({ page: 1, limit: 12 })).toContain(USERS_LIST_NS);
    });

    it('produces a different key per page and per limit', () => {
      const p1 = usersListKey({ page: 1, limit: 12 });
      const p2 = usersListKey({ page: 2, limit: 12 });
      const l = usersListKey({ page: 1, limit: 24 });
      expect(new Set([p1, p2, l]).size).toBe(3);
    });

    it('normalizes a blank/whitespace search to the no-search key', () => {
      const none = usersListKey({ page: 1, limit: 12 });
      expect(usersListKey({ search: '   ', page: 1, limit: 12 })).toBe(none);
      expect(usersListKey({ search: '', page: 1, limit: 12 })).toBe(none);
    });

    it('trims the search term so equivalent searches share a key', () => {
      expect(usersListKey({ search: ' ada ', page: 1, limit: 12 })).toBe(
        usersListKey({ search: 'ada', page: 1, limit: 12 }),
      );
    });
  });

  describe('everythingIn', () => {
    it('builds a glob over a namespace', () => {
      expect(everythingIn(CLAIMS_LIST_NS)).toBe('claims:list:*');
      expect(everythingIn(USERS_LIST_NS)).toBe('users:list:*');
    });
  });
});
