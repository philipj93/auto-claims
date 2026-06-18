// Minimal stand-in for the NestJS API, used only by the Playwright e2e suite.
//
// The web app's pages are Server Components that fetch data *server-side*, so
// Playwright's in-browser request interception can't reach them. Instead we run
// this tiny HTTP server and point the web app's `API_URL` at it (see
// playwright.config.ts). It serves a fixed, deterministic dataset — no DB.
import { createServer } from 'node:http';

const PORT = Number(process.env.MOCK_API_PORT ?? 4100);

const alice = {
  id: 'u-alice',
  firstName: 'Alice',
  lastName: 'Nguyen',
  email: 'alice@example.com',
  phone: '555-0100',
  addressLine1: '1 Market St',
  city: 'San Francisco',
  state: 'CA',
  postalCode: '94105',
  createdAt: '2026-01-02T10:00:00.000Z',
  updatedAt: '2026-01-02T10:00:00.000Z',
};

const bob = {
  id: 'u-bob',
  firstName: 'Bob',
  lastName: 'Smith',
  email: 'bob@example.com',
  phone: null,
  addressLine1: null,
  city: null,
  state: null,
  postalCode: null,
  createdAt: '2026-01-03T10:00:00.000Z',
  updatedAt: '2026-01-03T10:00:00.000Z',
};

const claim = {
  id: 'c-001',
  claimNumber: 'CLM-2026-0001',
  status: 'UNDER_REVIEW',
  type: 'COLLISION',
  faultDetermination: 'NOT_AT_FAULT',
  description: 'Rear-ended at a stoplight on Main St.',
  incidentDate: '2026-05-01T12:00:00.000Z',
  reportedDate: '2026-05-02T12:00:00.000Z',
  incidentLocation: 'Main St & 5th Ave',
  estimatedAmount: 8200,
  approvedAmount: null,
  deductible: 500,
  injuryReported: true,
  policeReportNumber: 'PR-7788',
  adjusterName: 'Dana Lopez',
  createdAt: '2026-05-02T12:00:00.000Z',
  updatedAt: '2026-05-02T12:00:00.000Z',
  user: alice,
  vehicle: {
    id: 'veh-1',
    make: 'Toyota',
    model: 'Camry',
    year: 2021,
    vin: '1HGCM82633A004352',
    licensePlate: '7ABC123',
    color: 'Silver',
  },
  policy: {
    id: 'pol-1',
    policyNumber: 'POL-55512',
    status: 'ACTIVE',
    premium: 1200,
    deductible: 500,
    coverageLimit: 50000,
    effectiveDate: '2026-01-01T12:00:00.000Z',
    expirationDate: '2026-12-31T12:00:00.000Z',
  },
  documents: [
    {
      id: 'doc-1',
      type: 'PHOTO',
      fileName: 'damage-front.jpg',
      url: 'https://files.example.com/doc-1',
      createdAt: '2026-05-02T12:05:00.000Z',
    },
  ],
  notes: [
    {
      id: 'note-1',
      author: 'Dana Lopez',
      body: 'Opened claim and requested repair estimate.',
      createdAt: '2026-05-02T12:10:00.000Z',
    },
  ],
};

const usersWithCount = [
  { ...alice, claimCount: 1 },
  { ...bob, claimCount: 0 },
];
// The list endpoint returns the Paginated envelope ({ data, meta }), matching
// the real API — the home page reads `meta` to render its pager.
const usersPage = {
  data: usersWithCount,
  meta: {
    page: 1,
    limit: 12,
    total: usersWithCount.length,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false,
  },
};
const aliceClaims = [{ ...claim, documents: undefined, notes: undefined }];

// The authenticated user surfaced by the auth endpoints. Deterministic: the
// mock ignores credentials and tokens and always resolves to this account.
const authUser = {
  id: alice.id,
  username: 'demo',
  email: alice.email,
  firstName: alice.firstName,
  lastName: alice.lastName,
};

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

// Routes are matched by method + pathname. Each handler returns a body (200) or
// `null` (404). Auth endpoints ignore the request body/token by design.
const routes = [
  ['GET', /^\/api\/users$/, () => usersPage],
  ['GET', /^\/api\/users\/([^/]+)$/, (m) => (m[1] === alice.id ? alice : null)],
  ['GET', /^\/api\/users\/([^/]+)\/claims$/, (m) => (m[1] === alice.id ? aliceClaims : [])],
  ['GET', /^\/api\/claims\/([^/]+)$/, (m) => (m[1] === claim.id ? claim : null)],
  ['POST', /^\/api\/auth\/login$/, () => ({ accessToken: 'e2e-test-token', user: authUser })],
  ['POST', /^\/api\/auth\/register$/, () => ({ accessToken: 'e2e-test-token', user: authUser })],
  ['GET', /^\/api\/auth\/me$/, () => authUser],
];

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  for (const [method, pattern, handler] of routes) {
    if (req.method !== method) continue;
    const match = url.pathname.match(pattern);
    if (match) {
      const body = handler(match);
      return body === null ? json(res, 404, { message: 'Not Found' }) : json(res, 200, body);
    }
  }
  json(res, 404, { message: 'Not Found' });
});

server.listen(PORT, () => {
  console.log(`[mock-api] listening on http://127.0.0.1:${PORT}`);
});
