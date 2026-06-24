import { describe, expect, it } from 'vitest';
import {
  composeRefreshToken,
  generateRefreshSecret,
  hashRefreshSecret,
  parseRefreshToken,
  refreshSecretMatches,
} from './refresh-token';

describe('refresh-token helpers', () => {
  it('generates a high-entropy secret and its sha256 hash', () => {
    const a = generateRefreshSecret();
    const b = generateRefreshSecret();
    expect(a.secret).not.toBe(b.secret); // random per call
    expect(a.hash).toBe(hashRefreshSecret(a.secret));
    expect(a.hash).toHaveLength(64); // sha256 hex
    expect(a.hash).not.toContain(a.secret); // hashed, not reversible
  });

  it('round-trips compose → parse', () => {
    const token = composeRefreshToken('session-id', 'the-secret');
    expect(parseRefreshToken(token)).toEqual({ sessionId: 'session-id', secret: 'the-secret' });
  });

  it('preserves a separator inside the secret half', () => {
    const token = composeRefreshToken('sid', 'a.b.c');
    expect(parseRefreshToken(token)).toEqual({ sessionId: 'sid', secret: 'a.b.c' });
  });

  it('rejects malformed tokens', () => {
    expect(parseRefreshToken('no-separator')).toBeNull();
    expect(parseRefreshToken('.leading')).toBeNull();
    expect(parseRefreshToken('trailing.')).toBeNull();
    expect(parseRefreshToken('')).toBeNull();
  });

  it('matches a secret against its stored hash in constant time', () => {
    const { secret, hash } = generateRefreshSecret();
    expect(refreshSecretMatches(secret, hash)).toBe(true);
    expect(refreshSecretMatches('wrong', hash)).toBe(false);
    expect(refreshSecretMatches(secret, 'short-hash')).toBe(false); // length mismatch, no throw
  });
});
