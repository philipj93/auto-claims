import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ClaimType } from '@repo/types';
import { CreateClaimDto } from './create-claim.dto';
import { USER_ID, VEHICLE_ID } from '../../../test/utils/fixtures';

const validPayload = {
  userId: USER_ID,
  vehicleId: VEHICLE_ID,
  type: ClaimType.COLLISION,
  description: 'Rear-ended at a red light on Main St.',
  incidentDate: '2024-05-01T12:00:00.000Z',
  estimatedAmount: 5000,
};

/** Returns the set of property names that failed validation. */
async function failingProps(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateClaimDto, payload);
  const errors = await validate(dto);
  return errors.map((e) => e.property);
}

describe('CreateClaimDto', () => {
  it('accepts a fully valid payload', async () => {
    expect(await failingProps(validPayload)).toEqual([]);
  });

  it('accepts a payload with the optional fields present', async () => {
    const props = await failingProps({
      ...validPayload,
      policyId: '44444444-4444-4444-8444-444444444444',
      incidentLocation: 'Main St & 5th Ave',
      deductible: 250,
      injuryReported: true,
      policeReportNumber: 'PR-123',
    });
    expect(props).toEqual([]);
  });

  it('rejects a non-UUID userId / vehicleId', async () => {
    const props = await failingProps({
      ...validPayload,
      userId: 'not-a-uuid',
      vehicleId: 'nope',
    });
    expect(props).toContain('userId');
    expect(props).toContain('vehicleId');
  });

  it('rejects a description shorter than 10 characters', async () => {
    expect(await failingProps({ ...validPayload, description: 'too short' })).toContain(
      'description',
    );
  });

  it('rejects an invalid claim type', async () => {
    expect(await failingProps({ ...validPayload, type: 'FENDER_BENDER' })).toContain('type');
  });

  it('rejects a non-ISO incident date', async () => {
    expect(await failingProps({ ...validPayload, incidentDate: 'last tuesday' })).toContain(
      'incidentDate',
    );
  });

  it('rejects negative monetary amounts', async () => {
    expect(await failingProps({ ...validPayload, estimatedAmount: -1 })).toContain(
      'estimatedAmount',
    );
    expect(await failingProps({ ...validPayload, deductible: -5 })).toContain('deductible');
  });

  it('rejects missing required fields', async () => {
    const props = await failingProps({});
    expect(props).toEqual(
      expect.arrayContaining([
        'userId',
        'vehicleId',
        'type',
        'description',
        'incidentDate',
        'estimatedAmount',
      ]),
    );
  });
});
