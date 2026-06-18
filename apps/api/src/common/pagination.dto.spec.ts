import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PaginationQueryDto } from './pagination.dto';

function toDto(payload: Record<string, unknown>) {
  return plainToInstance(PaginationQueryDto, payload);
}

async function failingProps(payload: Record<string, unknown>) {
  const errors = await validate(toDto(payload));
  return errors.map((e) => e.property);
}

describe('PaginationQueryDto', () => {
  it('defaults to page 1, limit 12 when omitted', async () => {
    const dto = toDto({});
    expect(await validate(dto)).toEqual([]);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(12);
    expect(dto.skip).toBe(0);
  });

  it('coerces string query values to numbers', async () => {
    const dto = toDto({ page: '3', limit: '10' });
    expect(await validate(dto)).toEqual([]);
    expect(dto.page).toBe(3);
    expect(dto.limit).toBe(10);
    expect(dto.skip).toBe(20);
  });

  it('rejects a non-positive page', async () => {
    expect(await failingProps({ page: '0' })).toContain('page');
    expect(await failingProps({ page: '-1' })).toContain('page');
  });

  it('rejects a non-integer page', async () => {
    expect(await failingProps({ page: '1.5' })).toContain('page');
  });

  it('rejects a limit above the maximum', async () => {
    expect(await failingProps({ limit: '101' })).toContain('limit');
  });
});
