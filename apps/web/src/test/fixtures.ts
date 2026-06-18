import {
  ClaimStatus,
  ClaimType,
  DocumentType,
  FaultDetermination,
  PolicyStatus,
  type Claim,
  type Paginated,
  type User,
} from '@repo/types';
import type { UserWithCount } from '@/lib/api';

/** Wrap a single page of rows in the API's `Paginated<T>` envelope. */
export function paginated<T>(data: T[], page = 1, limit = 12, total = data.length): Paginated<T> {
  const totalPages = Math.ceil(total / limit);
  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages,
      hasPreviousPage: page > 1,
      hasNextPage: page < totalPages,
    },
  };
}

/**
 * Deterministic domain fixtures shared by unit, integration, and (via the JSON
 * snapshot in `e2e/mock-api`) end-to-end tests. Keep these in sync with the
 * shapes in `@repo/types`.
 */

export const aliceId = '11111111-1111-1111-1111-111111111111';
export const bobId = '22222222-2222-2222-2222-222222222222';
export const claimId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

export const alice: User = {
  id: aliceId,
  username: 'alice',
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

export const bob: User = {
  id: bobId,
  username: 'bob',
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

export const usersWithCount: UserWithCount[] = [
  { ...alice, claimCount: 2 },
  { ...bob, claimCount: 0 },
];

export const claim: Claim = {
  id: claimId,
  claimNumber: 'CLM-2026-0001',
  status: ClaimStatus.UNDER_REVIEW,
  type: ClaimType.COLLISION,
  faultDetermination: FaultDetermination.NOT_AT_FAULT,
  description: 'Rear-ended at a stoplight on Main St.',
  incidentDate: '2026-05-01T00:00:00.000Z',
  reportedDate: '2026-05-02T00:00:00.000Z',
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
    status: PolicyStatus.ACTIVE,
    premium: 1200,
    deductible: 500,
    coverageLimit: 50000,
    effectiveDate: '2026-01-01T00:00:00.000Z',
    expirationDate: '2026-12-31T00:00:00.000Z',
  },
  documents: [
    {
      id: 'doc-1',
      type: DocumentType.PHOTO,
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

export const aliceClaims: Claim[] = [
  {
    ...claim,
    documents: undefined,
    notes: undefined,
    policy: undefined,
  },
  {
    ...claim,
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    claimNumber: 'CLM-2026-0002',
    status: ClaimStatus.APPROVED,
    type: ClaimType.GLASS,
    estimatedAmount: 450,
    approvedAmount: 450,
    vehicle: undefined,
    documents: undefined,
    notes: undefined,
    policy: undefined,
  },
];
