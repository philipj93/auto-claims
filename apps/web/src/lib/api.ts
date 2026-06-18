import type { Claim, Paginated, User } from '@repo/types';

const API_URL = process.env.API_URL ?? 'http://localhost:4000/api';

export type UserWithCount = User & { claimCount: number };

/** Default page size for the policyholders list — matches the API default. */
export const USERS_PAGE_SIZE = 12;

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    // Always fetch fresh data for this demo.
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });

  if (res.status === 404) {
    return null as T;
  }
  if (!res.ok) {
    throw new Error(`API request failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
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
