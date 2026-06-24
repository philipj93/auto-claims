import { NextResponse, type NextRequest } from 'next/server';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  accessCookieOptions,
  refreshCookieOptions,
} from '@/lib/cookies';
import { isJwtExpired } from '@/lib/jwt';
import { refreshRequest } from '@/lib/refresh';

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
  } catch {
    // Refresh rejected (expired / reused / revoked): clear cookies and log in.
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
