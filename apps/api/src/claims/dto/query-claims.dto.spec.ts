import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ClaimStatus, ClaimType } from '@repo/types';
import { QueryClaimsDto } from './query-claims.dto';
import { USER_ID } from '../../../test/utils/fixtures';

async function failingProps(payload: Record<string, unknown>) {
  const errors = await validate(plainToInstance(QueryClaimsDto, payload));
  return errors.map((e) => e.property);
}

describe('QueryClaimsDto', () => {
  it('accepts an empty query (all filters optional)', async () => {
    expect(await failingProps({})).toEqual([]);
  });

  it('accepts valid filters', async () => {
    const props = await failingProps({
      userId: USER_ID,
      status: ClaimStatus.PAID,
      type: ClaimType.THEFT,
    });
    expect(props).toEqual([]);
  });

  it('rejects a non-UUID userId', async () => {
    expect(await failingProps({ userId: 'abc' })).toContain('userId');
  });

  it('rejects an unknown status or type', async () => {
    expect(await failingProps({ status: 'PENDING' })).toContain('status');
    expect(await failingProps({ type: 'SCRATCH' })).toContain('type');
  });
});
