/**
 * Cache key namespaces + builders shared by the services that read through the
 * cache and the writes that invalidate it. Keep keys here so a writer (e.g. a
 * claim write) can bust another reader's namespace (e.g. the users list, whose
 * claim counts a new claim changes) without guessing the string.
 */

/** TTL for cached list responses. Short: lists tolerate brief staleness, and writes bust them anyway. */
export const LIST_TTL_SECONDS = 30;

export const CLAIMS_LIST_NS = 'claims:list';
export const USERS_LIST_NS = 'users:list';

/** Key for a claims list response, keyed by its (optional) filters. */
export function claimsListKey(query: { userId?: string; status?: string; type?: string }): string {
  const parts = {
    userId: query.userId ?? null,
    status: query.status ?? null,
    type: query.type ?? null,
  };
  return `${CLAIMS_LIST_NS}:${JSON.stringify(parts)}`;
}

/** Key for a users list response, keyed by search term + page window. */
export function usersListKey(query: { search?: string; page: number; limit: number }): string {
  const parts = {
    search: query.search?.trim() || null,
    page: query.page,
    limit: query.limit,
  };
  return `${USERS_LIST_NS}:${JSON.stringify(parts)}`;
}

/** Glob matching every key in a namespace, for pattern invalidation. */
export const everythingIn = (namespace: string): string => `${namespace}:*`;
