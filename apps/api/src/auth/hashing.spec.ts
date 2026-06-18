import { describe, expect, it } from 'vitest';
import { comparePassword, hashPassword } from './hashing';

describe('hashing', () => {
  it('hashes a password to a non-plaintext bcrypt string', async () => {
    const hash = await hashPassword('s3cret-pw');
    expect(hash).not.toBe('s3cret-pw');
    expect(hash.startsWith('$2')).toBe(true);
  });

  it('comparePassword returns true for the correct password', async () => {
    const hash = await hashPassword('s3cret-pw');
    expect(await comparePassword('s3cret-pw', hash)).toBe(true);
  });

  it('comparePassword returns false for a wrong password', async () => {
    const hash = await hashPassword('s3cret-pw');
    expect(await comparePassword('wrong', hash)).toBe(false);
  });
});
