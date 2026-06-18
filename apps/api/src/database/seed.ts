import 'reflect-metadata';
import { faker } from '@faker-js/faker';
import {
  ClaimStatus,
  ClaimType,
  DocumentType,
  FaultDetermination,
  PolicyStatus,
} from '@repo/types';
import { hashPassword } from '../auth/hashing';
import { AppDataSource } from './data-source';
import { User } from '../entities/user.entity';
import { Vehicle } from '../entities/vehicle.entity';
import { Policy } from '../entities/policy.entity';
import { Claim } from '../entities/claim.entity';
import { ClaimDocument } from '../entities/claim-document.entity';
import { ClaimNote } from '../entities/claim-note.entity';

const CLAIM_TYPES = Object.values(ClaimType);
const CLAIM_STATUSES = Object.values(ClaimStatus);
const FAULTS = Object.values(FaultDetermination);
const VEHICLE_MAKES: Record<string, string[]> = {
  Toyota: ['Camry', 'Corolla', 'RAV4', 'Highlander'],
  Honda: ['Civic', 'Accord', 'CR-V', 'Pilot'],
  Ford: ['F-150', 'Escape', 'Explorer', 'Mustang'],
  Tesla: ['Model 3', 'Model Y', 'Model S'],
  Subaru: ['Outback', 'Forester', 'Impreza'],
  Chevrolet: ['Silverado', 'Equinox', 'Malibu'],
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function claimNumber(year: number): string {
  return `CLM-${year}-${faker.number.int({ min: 100000, max: 999999 })}`;
}

function policyNumber(): string {
  return `POL-${faker.string.alphanumeric({ length: 8, casing: 'upper' })}`;
}

const ADJUSTERS = ['Dana Whitfield', 'Marcus Lee', 'Priya Nair', 'Sofia Hernandez', 'Tom Becker'];

async function seed() {
  await AppDataSource.initialize();
  // Fuzzy search (UsersService.search) needs pg_trgm. Prod gets it via the
  // AddPolicyholderSearchIndex migration; dev runs synchronize, so install here.
  await AppDataSource.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
  console.log('🔌 Connected to database');

  // Clean slate (respects FK order; CASCADE handles children).
  await AppDataSource.query(
    'TRUNCATE TABLE claim_notes, claim_documents, claims, policies, vehicles, users RESTART IDENTITY CASCADE',
  );
  console.log('🧹 Cleared existing data');

  const userRepo = AppDataSource.getRepository(User);
  const vehicleRepo = AppDataSource.getRepository(Vehicle);
  const policyRepo = AppDataSource.getRepository(Policy);
  const claimRepo = AppDataSource.getRepository(Claim);

  const NUM_USERS = 50;
  let totalClaims = 0;

  // Every seeded account shares this password so the data is easy to log into.
  const SEED_PASSWORD = 'Password123!';
  const seedPasswordHash = await hashPassword(SEED_PASSWORD);
  console.log(`🔑 All seeded users share the password: ${SEED_PASSWORD}`);

  for (let u = 0; u < NUM_USERS; u++) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();

    const username = faker.internet
      .username({ firstName, lastName })
      .toLowerCase()
      .replace(/[^a-z0-9_.]/g, '');
    const user = await userRepo.save(
      userRepo.create({
        firstName,
        lastName,
        // Suffix with the loop index to guarantee uniqueness across 50 users.
        username: `${username}${u}`,
        email: faker.internet.email({ firstName, lastName }).toLowerCase(),
        passwordHash: seedPasswordHash,
        phone: faker.phone.number({ style: 'national' }),
        addressLine1: faker.location.streetAddress(),
        city: faker.location.city(),
        state: faker.location.state({ abbreviated: true }),
        postalCode: faker.location.zipCode(),
      }),
    );

    // 1–3 vehicles per user
    const vehicles: Vehicle[] = [];
    const numVehicles = faker.number.int({ min: 1, max: 3 });
    for (let v = 0; v < numVehicles; v++) {
      const make = pick(Object.keys(VEHICLE_MAKES));
      const model = pick(VEHICLE_MAKES[make]);
      vehicles.push(
        await vehicleRepo.save(
          vehicleRepo.create({
            make,
            model,
            year: faker.number.int({ min: 2014, max: 2025 }),
            vin: faker.vehicle.vin(),
            licensePlate: faker.vehicle.vrm(),
            color: faker.vehicle.color(),
            userId: user.id,
          }),
        ),
      );
    }

    // 1–3 policies per user (first ACTIVE, rest varied)
    const POLICY_STATUSES = Object.values(PolicyStatus);
    const numPolicies = faker.number.int({ min: 1, max: 3 });
    const policies: Policy[] = [];
    for (let p = 0; p < numPolicies; p++) {
      const effective = faker.date.past({ years: 2 });
      const expiration = new Date(effective);
      expiration.setFullYear(expiration.getFullYear() + 1);
      policies.push(
        await policyRepo.save(
          policyRepo.create({
            policyNumber: policyNumber(),
            // First policy is always ACTIVE so each user has a usable policy;
            // the rest vary across the full enum to exercise every status.
            status: p === 0 ? PolicyStatus.ACTIVE : pick(POLICY_STATUSES),
            premium: faker.number.float({ min: 900, max: 2400, fractionDigits: 2 }),
            deductible: pick([250, 500, 1000]),
            coverageLimit: pick([50000, 100000, 250000]),
            effectiveDate: effective.toISOString().slice(0, 10),
            expirationDate: expiration.toISOString().slice(0, 10),
            userId: user.id,
          }),
        ),
      );
    }

    // 3–12 claims per user
    const numClaims = faker.number.int({ min: 3, max: 12 });
    for (let c = 0; c < numClaims; c++) {
      const vehicle = pick(vehicles);
      const policy = pick(policies);
      const incidentDate = faker.date.recent({ days: 365 });
      // Reported 0–5 days after the incident, but never in the future — adding
      // the offset to a very recent incident could otherwise overshoot `now`,
      // which breaks the note date range below.
      const reportedDate = new Date(
        Math.min(
          incidentDate.getTime() + faker.number.int({ min: 0, max: 5 }) * 86400000,
          Date.now(),
        ),
      );
      const status = pick(CLAIM_STATUSES);
      const estimated = faker.number.float({
        min: 500,
        max: 35000,
        fractionDigits: 2,
      });
      const isSettled = [ClaimStatus.APPROVED, ClaimStatus.PAID, ClaimStatus.CLOSED].includes(
        status,
      );
      const injuryReported = faker.datatype.boolean({ probability: 0.25 });

      const documents: ClaimDocument[] = [];
      const numDocs = faker.number.int({ min: 1, max: 6 });
      for (let d = 0; d < numDocs; d++) {
        const type = pick(Object.values(DocumentType));
        documents.push(
          AppDataSource.getRepository(ClaimDocument).create({
            type,
            fileName: `${type.toLowerCase()}-${faker.string.alphanumeric(6)}.${
              type === DocumentType.PHOTO ? 'jpg' : 'pdf'
            }`,
            url: faker.internet.url(),
          }),
        );
      }

      const notes: ClaimNote[] = [];
      const numNotes = faker.number.int({ min: 1, max: 4 });
      // Notes land between the report date and now; guard against `from === to`.
      const noteTo = new Date(Math.max(reportedDate.getTime() + 1, Date.now()));
      for (let n = 0; n < numNotes; n++) {
        notes.push(
          AppDataSource.getRepository(ClaimNote).create({
            author: pick(ADJUSTERS),
            body: faker.lorem.sentence({ min: 8, max: 18 }),
            createdAt: faker.date.between({
              from: reportedDate,
              to: noteTo,
            }),
          }),
        );
      }

      const claim = claimRepo.create({
        claimNumber: claimNumber(incidentDate.getFullYear()),
        status,
        type: pick(CLAIM_TYPES),
        faultDetermination: pick(FAULTS),
        description: faker.lorem.paragraph(),
        incidentDate,
        reportedDate,
        incidentLocation: `${faker.location.streetAddress()}, ${faker.location.city()}`,
        estimatedAmount: estimated,
        approvedAmount: isSettled
          ? faker.number.float({
              min: estimated * 0.6,
              max: estimated,
              fractionDigits: 2,
            })
          : null,
        deductible: policy.deductible,
        injuryReported,
        policeReportNumber: faker.datatype.boolean() ? `PR-${faker.string.numeric(7)}` : null,
        adjusterName: status === ClaimStatus.SUBMITTED ? null : pick(ADJUSTERS),
        userId: user.id,
        vehicleId: vehicle.id,
        policyId: policy.id,
        documents,
        notes,
      });

      await claimRepo.save(claim);
      totalClaims++;
    }

    console.log(`👤 ${firstName} ${lastName} — ${numVehicles} vehicle(s), ${numClaims} claim(s)`);
  }

  const demo = await userRepo.save(
    userRepo.create({
      firstName: 'Demo',
      lastName: 'User',
      username: 'demo',
      email: 'demo@example.com',
      passwordHash: seedPasswordHash,
      phone: faker.phone.number({ style: 'national' }),
      addressLine1: faker.location.streetAddress(),
      city: faker.location.city(),
      state: faker.location.state({ abbreviated: true }),
      postalCode: faker.location.zipCode(),
    }),
  );
  console.log(`\n🎟️  Demo login → username: demo  password: ${SEED_PASSWORD} (id: ${demo.id})`);

  console.log(`\n✅ Seed complete: ${NUM_USERS + 1} users, ${totalClaims} claims`);
  await AppDataSource.destroy();
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
