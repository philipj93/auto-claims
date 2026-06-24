import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '@/test/msw/server';
import { API_BASE } from '@/test/msw/handlers';
import { logoutRequest, RefreshError, refreshRequest } from './refresh';

describe('refreshRequest', () => {
  it('returns the rotated token pair on success', async () => {
    server.use(
      http.post(`${API_BASE}/auth/refresh`, () =>
        HttpResponse.json({ accessToken: 'new-access', refreshToken: 'new-refresh' }),
      ),
    );
    await expect(refreshRequest('old-refresh')).resolves.toEqual({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    });
  });

  it('sends the refresh token in the body', async () => {
    let body: unknown;
    server.use(
      http.post(`${API_BASE}/auth/refresh`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ accessToken: 'a', refreshToken: 'r' });
      }),
    );
    await refreshRequest('old-refresh');
    expect(body).toEqual({ refreshToken: 'old-refresh' });
  });

  it('throws RefreshError when the token is rejected (401)', async () => {
    server.use(
      http.post(`${API_BASE}/auth/refresh`, () => new HttpResponse(null, { status: 401 })),
    );
    await expect(refreshRequest('stale')).rejects.toBeInstanceOf(RefreshError);
  });
});

describe('logoutRequest', () => {
  it('posts the refresh token to the logout endpoint', async () => {
    let body: unknown;
    server.use(
      http.post(`${API_BASE}/auth/logout`, async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await logoutRequest('the-token');
    expect(body).toEqual({ refreshToken: 'the-token' });
  });

  it('never throws on a network failure (best-effort)', async () => {
    server.use(http.post(`${API_BASE}/auth/logout`, () => HttpResponse.error()));
    await expect(logoutRequest('the-token')).resolves.toBeUndefined();
  });
});
