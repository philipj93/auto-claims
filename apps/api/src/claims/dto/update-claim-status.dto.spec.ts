import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ClaimStatus } from '@repo/types';
import { UpdateClaimStatusDto } from './update-claim-status.dto';

async function failingProps(payload: Record<string, unknown>) {
  const errors = await validate(plainToInstance(UpdateClaimStatusDto, payload));
  return errors.map((e) => e.property);
}

describe('UpdateClaimStatusDto', () => {
  it('accepts a bare status', async () => {
    expect(await failingProps({ status: ClaimStatus.UNDER_REVIEW })).toEqual([]);
  });

  it('accepts status with optional approvedAmount and adjusterName', async () => {
    const props = await failingProps({
      status: ClaimStatus.APPROVED,
      approvedAmount: 4200,
      adjusterName: 'Grace Hopper',
    });
    expect(props).toEqual([]);
  });

  it('requires a valid status enum', async () => {
    expect(await failingProps({})).toContain('status');
    expect(await failingProps({ status: 'WIP' })).toContain('status');
  });

  it('rejects a negative approvedAmount', async () => {
    expect(await failingProps({ status: ClaimStatus.APPROVED, approvedAmount: -1 })).toContain(
      'approvedAmount',
    );
  });
});
