import { describe, expect, it } from 'vitest';
import { decodeJwtExp, isJwtExpired } from './jwt';

/** Build a structurally valid (unsigned) JWT carrying the given payload. */
function makeJwt(payload: object): string {
  const encode = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`;
}

const nowSec = () => Math.floor(Date.now() / 1000);

describe('decodeJwtExp', () => {
  it('reads the exp claim', () => {
    expect(decodeJwtExp(makeJwt({ exp: 1_700_000_000 }))).toBe(1_700_000_000);
  });

  it('returns null for a token without three segments', () => {
    expect(decodeJwtExp('only.two')).toBeNull();
    expect(decodeJwtExp('not-a-jwt')).toBeNull();
  });

  it('returns null when exp is absent or non-numeric', () => {
    expect(decodeJwtExp(makeJwt({ sub: 'user-1' }))).toBeNull();
    expect(decodeJwtExp(makeJwt({ exp: 'soon' }))).toBeNull();
  });
});

describe('isJwtExpired', () => {
  it('is false for a token expiring well in the future', () => {
    expect(isJwtExpired(makeJwt({ exp: nowSec() + 3600 }))).toBe(false);
  });

  it('is true for an already-expired token', () => {
    expect(isJwtExpired(makeJwt({ exp: nowSec() - 60 }))).toBe(true);
  });

  it('is true inside the clock-skew window (about to expire)', () => {
    expect(isJwtExpired(makeJwt({ exp: nowSec() + 5 }), 10)).toBe(true);
  });

  it('treats an unreadable token as expired', () => {
    expect(isJwtExpired('garbage')).toBe(true);
  });
});
