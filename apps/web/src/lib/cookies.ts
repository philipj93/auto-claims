/**
 * Auth cookie names + option builders. Kept free of `next/headers` and
 * `next/navigation` so this module is safe to import from middleware (which runs
 * on the edge runtime and cannot use those server-only APIs).
 */

/** httpOnly cookie holding the short-lived JWT access token. */
export const ACCESS_TOKEN_COOKIE = 'access_token';
/** httpOnly cookie holding the opaque, rotating refresh token. */
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

// These cookie lifetimes mirror the API's token TTLs by convention — the web app
// can't read the API's env, so they are NOT auto-derived. If you change
// `JWT_EXPIRES_IN` or `REFRESH_TOKEN_EXPIRES_IN_DAYS` on the API, update these to
// match. The cookie outliving its token is harmless (middleware refreshes on the
// JWT's own `exp`); a cookie expiring early just forces an earlier re-login.

/** Access-cookie lifetime — mirrors the API's `JWT_EXPIRES_IN` (15m). */
const ACCESS_TOKEN_MAX_AGE = 60 * 15;
/** Refresh-cookie lifetime — mirrors `REFRESH_TOKEN_EXPIRES_IN_DAYS` (30d). */
const REFRESH_TOKEN_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * Structural cookie options accepted by both the `next/headers` cookie store and
 * `NextResponse.cookies.set` — typed locally to avoid importing a Next internal.
 */
interface CookieOptions {
  httpOnly: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  secure: boolean;
  path: string;
  maxAge: number;
}

function baseOptions(maxAge: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  };
}

export function accessCookieOptions(): CookieOptions {
  return baseOptions(ACCESS_TOKEN_MAX_AGE);
}

export function refreshCookieOptions(): CookieOptions {
  return baseOptions(REFRESH_TOKEN_MAX_AGE);
}
