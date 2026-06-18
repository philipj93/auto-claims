import {
  ClaimStatus,
  ClaimType,
  FaultDetermination,
  PolicyStatus,
} from '@repo/types';
import type { Claim } from '../../src/entities/claim.entity';
import type { User } from '../../src/entities/user.entity';
import type { Vehicle } from '../../src/entities/vehicle.entity';

// Stable UUIDs so assertions and ParseUUIDPipe checks are predictable.
export const USER_ID = '11111111-1111-4111-8111-111111111111';
export const VEHICLE_ID = '22222222-2222-4222-8222-222222222222';
export const CLAIM_ID = '33333333-3333-4333-8333-333333333333';
export const POLICY_ID = '44444444-4444-4444-8444-444444444444';

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: USER_ID,
    username: 'ada',
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    passwordHash: '$2b$10$test.hash.value.placeholder.for.fixturesxxxxxxxxxxxx',
    phone: '555-0100',
    addressLine1: '1 Analytical Way',
    city: 'London',
    state: 'NY',
    postalCode: '10001',
    vehicles: [],
    policies: [],
    claims: [],
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  } as User;
}

export function makeVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: VEHICLE_ID,
    make: 'Toyota',
    model: 'Corolla',
    year: 2020,
    vin: '1HGBH41JXMN109186',
    licensePlate: 'ABC-1234',
    color: 'Silver',
    userId: USER_ID,
    user: undefined as unknown as User,
    claims: [],
    ...overrides,
  } as Vehicle;
}

export function makeClaim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: CLAIM_ID,
    claimNumber: 'CLM-2024-100001',
    status: ClaimStatus.SUBMITTED,
    type: ClaimType.COLLISION,
    faultDetermination: FaultDetermination.UNDETERMINED,
    description: 'Rear-ended at a red light on Main St.',
    incidentDate: new Date('2024-05-01T12:00:00Z'),
    reportedDate: new Date('2024-05-02T09:00:00Z'),
    incidentLocation: 'Main St & 5th Ave',
    estimatedAmount: 5000,
    approvedAmount: null,
    deductible: 500,
    injuryReported: false,
    policeReportNumber: null,
    adjusterName: null,
    userId: USER_ID,
    user: undefined as unknown as User,
    vehicleId: VEHICLE_ID,
    vehicle: undefined as unknown as Vehicle,
    policyId: null,
    policy: null,
    documents: [],
    notes: [],
    createdAt: new Date('2024-05-02T09:00:00Z'),
    updatedAt: new Date('2024-05-02T09:00:00Z'),
    ...overrides,
  } as Claim;
}

export { PolicyStatus };
