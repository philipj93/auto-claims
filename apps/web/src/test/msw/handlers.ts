import { http, HttpResponse } from 'msw';
import {
  alice,
  aliceClaims,
  aliceId,
  claim,
  claimId,
  paginated,
  usersWithCount,
} from '@/test/fixtures';

/**
 * The web app's data layer (`src/lib/api.ts`) talks to the NestJS API at
 * `API_URL`, defaulting to `http://localhost:4000/api`. Tests don't load
 * `.env.local`, so that default is what MSW intercepts here.
 */
export const API_BASE = 'http://localhost:4000/api';

export const handlers = [
  http.get(`${API_BASE}/users`, () => HttpResponse.json(paginated(usersWithCount))),

  http.get(`${API_BASE}/users/:id`, ({ params }) =>
    params.id === aliceId ? HttpResponse.json(alice) : new HttpResponse(null, { status: 404 }),
  ),

  http.get(`${API_BASE}/users/:id/claims`, ({ params }) =>
    params.id === aliceId ? HttpResponse.json(aliceClaims) : HttpResponse.json([]),
  ),

  http.get(`${API_BASE}/claims/:id`, ({ params }) =>
    params.id === claimId ? HttpResponse.json(claim) : new HttpResponse(null, { status: 404 }),
  ),
];
