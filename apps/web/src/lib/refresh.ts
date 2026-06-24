import type { RefreshResponse } from '@repo/types';

/**
 * Raw `/auth/refresh` and `/auth/logout` HTTP calls, deliberately free of
 * `next/headers` so middleware can import them on the edge runtime. Cookie
 * reading/writing is the caller's job (middleware, route handler, or action).
 */

const API_URL = process.env.API_URL ?? 'http://localhost:4000/api';

/** Thrown when `/auth/refresh` rejects the refresh token (expired/reused/revoked). */
export class RefreshError extends Error {
  constructor(readonly status: number) {
    super(`Refresh failed: ${status}`);
    this.name = 'RefreshError';
  }
}

/** Exchange a refresh token for a fresh access token + rotated refresh token. */
export async function refreshRequest(refreshToken: string): Promise<RefreshResponse> {
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
    cache: 'no-store',
  });
  if (!res.ok) throw new RefreshError(res.status);
  return res.json() as Promise<RefreshResponse>;
}

/** Best-effort server-side session revoke. Never throws — logout always proceeds. */
export async function logoutRequest(refreshToken: string): Promise<void> {
  try {
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    });
  } catch {
    // Network failure on logout is non-fatal; the cookies are cleared regardless.
  }
}
