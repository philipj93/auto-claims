import { NextResponse, type NextRequest } from 'next/server';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  accessCookieOptions,
  refreshCookieOptions,
} from '@/lib/cookies';
import { isJwtExpired } from '@/lib/jwt';
import { refreshRequest, RefreshError } from '@/lib/refresh';

const PUBLIC_PATHS = ['/login', '/register'];

/**
 * Gate every page behind a valid access token, transparently refreshing it when
 * it has expired. Refresh lives here (not in `apiGet`) because Next forbids
 * cookie writes during RSC render, and rotating a refresh token without
 * persisting the new one would trip the API's reuse-detection and revoke the
 * session. Middleware can write cookies, so it's the only safe place to rotate.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;

  // A present, unexpired access token: let the request through untouched.
  if (accessToken && !isJwtExpired(accessToken)) {
    return NextResponse.next();
  }

  // Nothing to refresh with → go log in.
  if (!refreshToken) {
    return redirectToLogin(request);
  }

  // Access token missing/expired but a refresh token exists: rotate silently.
  try {
    const tokens = await refreshRequest(refreshToken);

    // Make the fresh access token visible to this same request's RSC render...
    request.cookies.set(ACCESS_TOKEN_COOKIE, tokens.accessToken);
    const response = NextResponse.next({ request });

    // ...and persist the rotated pair on the browser for subsequent requests.
    response.cookies.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, accessCookieOptions());
    response.cookies.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, refreshCookieOptions());
    return response;
  } catch (err) {
    // Only a genuine auth rejection (refresh token expired / reused / revoked)
    // means the session is unrecoverable — clear cookies and send to /login.
    // A network error or 5xx means the API is down or broken but the refresh
    // token may well still be valid; don't destroy the user's credentials over a
    // transient outage. Let the request proceed with the existing cookies so the
    // next navigation retries the refresh once the API recovers.
    const isAuthRejection = err instanceof RefreshError && err.status >= 400 && err.status < 500;
    if (!isAuthRejection) {
      console.error('[middleware] token refresh failed (treating as transient):', err);
      return NextResponse.next();
    }
    const response = redirectToLogin(request);
    response.cookies.delete(ACCESS_TOKEN_COOKIE);
    response.cookies.delete(REFRESH_TOKEN_COOKIE);
    return response;
  }
}

function redirectToLogin(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  return NextResponse.redirect(url);
}

export const config = {
  // Run on all routes except Next internals, the logout endpoint, and static files.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logout).*)'],
};
