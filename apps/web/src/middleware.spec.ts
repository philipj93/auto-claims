import { http, HttpResponse } from 'msw';
import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { server } from '@/test/msw/server';
import { API_BASE } from '@/test/msw/handlers';
import { middleware } from './middleware';

/** An (unsigned) access token whose exp is `offsetSec` from now. */
function accessToken(offsetSec: number): string {
  const encode = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${encode({ alg: 'HS256' })}.${encode({ exp: Math.floor(Date.now() / 1000) + offsetSec })}.sig`;
}

function requestFor(path: string, cookies: Record<string, string> = {}): NextRequest {
  const cookie = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
  return new NextRequest(new URL(`http://localhost:3000${path}`), {
    headers: cookie ? { cookie } : {},
  });
}

const isPassThrough = (res: Response) => res.headers.get('x-middleware-next') === '1';

describe('middleware', () => {
  it('lets a request with a valid access token through', async () => {
    const res = await middleware(requestFor('/dashboard', { access_token: accessToken(3600) }));
    expect(isPassThrough(res)).toBe(true);
  });

  it('skips the auth check on public paths', async () => {
    const res = await middleware(requestFor('/login'));
    expect(isPassThrough(res)).toBe(true);
  });

  it('redirects to /login when no tokens are present', async () => {
    const res = await middleware(requestFor('/dashboard'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('silently refreshes an expired access token and sets the rotated pair', async () => {
    server.use(
      http.post(`${API_BASE}/auth/refresh`, () =>
        HttpResponse.json({ accessToken: 'fresh-access', refreshToken: 'fresh-refresh' }),
      ),
    );
    const res = await middleware(
      requestFor('/dashboard', { access_token: accessToken(-100), refresh_token: 'r1' }),
    );

    expect(isPassThrough(res)).toBe(true);
    expect(res.cookies.get('access_token')?.value).toBe('fresh-access');
    expect(res.cookies.get('refresh_token')?.value).toBe('fresh-refresh');
  });

  it('refreshes when the access cookie is gone but a refresh token remains', async () => {
    server.use(
      http.post(`${API_BASE}/auth/refresh`, () =>
        HttpResponse.json({ accessToken: 'a', refreshToken: 'r' }),
      ),
    );
    const res = await middleware(requestFor('/dashboard', { refresh_token: 'r1' }));
    expect(res.cookies.get('access_token')?.value).toBe('a');
  });

  it('redirects to /login and clears cookies when refresh is rejected (auth 401)', async () => {
    server.use(
      http.post(`${API_BASE}/auth/refresh`, () => new HttpResponse(null, { status: 401 })),
    );
    const res = await middleware(
      requestFor('/dashboard', { access_token: accessToken(-100), refresh_token: 'reused' }),
    );

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
    // delete() writes an empty, immediately-expiring cookie
    expect(res.cookies.get('access_token')?.value).toBeFalsy();
    expect(res.cookies.get('refresh_token')?.value).toBeFalsy();
  });

  it('does NOT log the user out on a transient API failure (5xx / network)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    server.use(
      http.post(`${API_BASE}/auth/refresh`, () => new HttpResponse(null, { status: 503 })),
    );

    const res = await middleware(
      requestFor('/dashboard', { access_token: accessToken(-100), refresh_token: 'still-valid' }),
    );

    // pass-through, no redirect, and the refresh cookie is left intact for a retry
    expect(isPassThrough(res)).toBe(true);
    expect(res.headers.get('location')).toBeNull();
    expect(res.cookies.get('refresh_token')?.value).toBeUndefined();
    errorSpy.mockRestore();
  });
});
