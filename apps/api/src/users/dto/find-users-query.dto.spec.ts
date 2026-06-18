import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FindUsersQueryDto } from './find-users-query.dto';

function toDto(payload: Record<string, unknown>) {
  return plainToInstance(FindUsersQueryDto, payload);
}

describe('FindUsersQueryDto', () => {
  it('leaves search undefined when omitted (and keeps pagination defaults)', async () => {
    const dto = toDto({});
    expect(await validate(dto)).toEqual([]);
    expect(dto.search).toBeUndefined();
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(12);
  });

  it('trims surrounding whitespace from search', async () => {
    const dto = toDto({ search: '  ada  ' });
    expect(await validate(dto)).toEqual([]);
    expect(dto.search).toBe('ada');
  });

  it('rejects a search longer than 100 chars', async () => {
    const errors = await validate(toDto({ search: 'x'.repeat(101) }));
    expect(errors.map((e) => e.property)).toContain('search');
  });

  it('rejects a non-string search', async () => {
    const errors = await validate(toDto({ search: { not: 'a string' } }));
    expect(errors.map((e) => e.property)).toContain('search');
  });
});
