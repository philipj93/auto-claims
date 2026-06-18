import { cookies } from 'next/headers';
import type { AuthUser } from '@repo/types';
import { fetchCurrentUser } from './api';

/** Name of the httpOnly cookie holding the JWT access token. */
export const ACCESS_TOKEN_COOKIE = 'access_token';

/** Read the access token from the request cookies (server-side only). */
export async function getAccessToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(ACCESS_TOKEN_COOKIE)?.value;
}

/** The currently signed-in user, or null if there is no/invalid token. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = await getAccessToken();
  if (!token) return null;
  return fetchCurrentUser(token);
}
