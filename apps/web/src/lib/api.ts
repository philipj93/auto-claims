import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type {
  AuthResponse,
  AuthUser,
  Claim,
  CreateUserInput,
  LoginInput,
  Paginated,
  User,
} from '@repo/types';

const API_URL = process.env.API_URL ?? 'http://localhost:4000/api';
const ACCESS_TOKEN_COOKIE = 'access_token';

export type UserWithCount = User & { claimCount: number };

/** Default page size for the policyholders list — matches the API default. */
export const USERS_PAGE_SIZE = 12;

/** Authenticated GET: forwards the bearer token from the request cookie. */
async function apiGet<T>(path: string): Promise<T> {
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  const res = await fetch(`${API_URL}${path}`, {
    // Always fetch fresh data for this demo.
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (res.status === 404) {
    return null as T;
  }
  if (res.status === 401) {
    // The cookie is present but the token is expired/invalid (the daily case once
    // JWT_EXPIRES_IN lapses). apiGet only runs server-side from RSC data fetches, so
    // redirect to /login rather than throwing an uncaught 500. redirect() throws an
    // internal NEXT_REDIRECT control-flow signal that must propagate uncaught.
    redirect('/login');
  }
  if (!res.ok) {
    throw new Error(`API request failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Thrown by `loginRequest` when login credentials are rejected, so the login
 * form can show an error. Distinct from the expired-token path: `apiGet`
 * redirects to /login itself rather than throwing this.
 */
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
    const message =
      res.status === 409
        ? 'Username or email already in use'
        : `Registration failed: ${res.status}`;
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
