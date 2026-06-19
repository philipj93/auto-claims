import { http, HttpResponse } from 'msw';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { describe, expect, it, vi } from 'vitest';
import { server } from '@/test/msw/server';
import { API_BASE } from '@/test/msw/handlers';
import {
  aliceClaims,
  aliceId,
  bobId,
  claim,
  claimId,
  paginated,
  usersWithCount,
} from '@/test/fixtures';
import { getClaim, getUser, getUserClaims, getUsers, loginRequest, RateLimitError } from './api';

// next/navigation's redirect throws NEXT_REDIRECT in real Next so control flow
// stops at the call site. Mirror that here (throw a sentinel string) so the mock
// matches production semantics — apiGet must not fall through to res.json() after
// a 401. (Factory is hoisted, so the sentinel is defined inline.)
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw 'NEXT_REDIRECT';
  }),
}));

describe('getUsers', () => {
  it('returns a page of users with claim counts and pagination meta', async () => {
    const result = await getUsers();
    expect(result.data).toEqual(usersWithCount);
    expect(result.meta.page).toBe(1);
  });

  it('forwards the requested page and limit as query params', async () => {
    let seenUrl: URL | null = null;
    server.use(
      http.get(`${API_BASE}/users`, ({ request }) => {
        seenUrl = new URL(request.url);
        return HttpResponse.json(paginated(usersWithCount, 2, 5));
      }),
    );

    await getUsers(2, 5);
    expect(seenUrl!.searchParams.get('page')).toBe('2');
    expect(seenUrl!.searchParams.get('limit')).toBe('5');
  });
});

describe('getUser', () => {
  it('returns the user when found', async () => {
    const user = await getUser(aliceId);
    expect(user?.email).toBe('alice@example.com');
  });

  it('returns null on a 404 instead of throwing', async () => {
    await expect(getUser(bobId)).resolves.toBeNull();
  });
});

describe('getUserClaims', () => {
  it('returns the claims for a user', async () => {
    await expect(getUserClaims(aliceId)).resolves.toEqual(aliceClaims);
  });

  it('returns an empty array for a user with no claims', async () => {
    await expect(getUserClaims(bobId)).resolves.toEqual([]);
  });
});

describe('getClaim', () => {
  it('returns the claim when found', async () => {
    const result = await getClaim(claimId);
    expect(result).toEqual(claim);
  });

  it('returns null on a 404', async () => {
    await expect(getClaim('does-not-exist')).resolves.toBeNull();
  });
});

describe('apiGet error handling', () => {
  it('throws with status text on a non-404 error response', async () => {
    server.use(
      http.get(
        `${API_BASE}/users`,
        () => new HttpResponse(null, { status: 500, statusText: 'Internal Server Error' }),
      ),
    );

    await expect(getUsers()).rejects.toThrow('API request failed: 500 Internal Server Error');
  });

  it('redirects to /login on a 401 (expired/invalid token) instead of throwing', async () => {
    // A present-but-stale cookie: middleware lets it through, the API returns 401.
    vi.mocked(cookies).mockResolvedValueOnce({
      get: () => ({ value: 'stale-token' }),
      set: () => {},
      delete: () => {},
    } as unknown as Awaited<ReturnType<typeof cookies>>);
    server.use(http.get(`${API_BASE}/users`, () => new HttpResponse(null, { status: 401 })));

    // redirect() interrupts control flow via a throw; swallow the sentinel and
    // assert the call (in production NEXT_REDIRECT is caught by Next, not us).
    await expect(getUsers()).rejects.toBe('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/login');
  });

  it('sends an Accept: application/json header', async () => {
    let seenAccept: string | null = null;
    server.use(
      http.get(`${API_BASE}/users`, ({ request }) => {
        seenAccept = request.headers.get('accept');
        return HttpResponse.json(usersWithCount);
      }),
    );

    await getUsers();
    expect(seenAccept).toBe('application/json');
  });
});

describe('loginRequest', () => {
  it('throws RateLimitError on a 429', async () => {
    server.use(http.post(`${API_BASE}/auth/login`, () => new HttpResponse(null, { status: 429 })));

    await expect(loginRequest({ username: 'ada', password: 'x' })).rejects.toBeInstanceOf(
      RateLimitError,
    );
  });
});
