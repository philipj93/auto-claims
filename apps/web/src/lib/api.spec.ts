import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
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
import { getClaim, getUser, getUserClaims, getUsers } from './api';

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
