import { cookies } from 'next/headers';
import type { AuthUser } from '@repo/types';
import { fetchCurrentUser } from './api';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  accessCookieOptions,
  refreshCookieOptions,
} from './cookies';

// Re-exported so existing importers (actions, route handlers) keep one import.
export { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from './cookies';

/** The access + refresh token pair returned by login / register / refresh. */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/** Read the access token from the request cookies (server-side only). */
export async function getAccessToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(ACCESS_TOKEN_COOKIE)?.value;
}

/** Read the refresh token from the request cookies (server-side only). */
export async function getRefreshToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(REFRESH_TOKEN_COOKIE)?.value;
}

/**
 * Persist the token pair as httpOnly cookies. Usable only where Next allows
 * cookie writes — Server Actions and Route Handlers (not during RSC render).
 */
export async function setAuthCookies(tokens: AuthTokens): Promise<void> {
  const store = await cookies();
  store.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, accessCookieOptions());
  store.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, refreshCookieOptions());
}

/** Drop both auth cookies (logout). */
export async function clearAuthCookies(): Promise<void> {
  const store = await cookies();
  store.delete(ACCESS_TOKEN_COOKIE);
  store.delete(REFRESH_TOKEN_COOKIE);
}

/** The currently signed-in user, or null if there is no/invalid token. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = await getAccessToken();
  if (!token) return null;
  return fetchCurrentUser(token);
}
