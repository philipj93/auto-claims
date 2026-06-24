import { createHash, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Refresh tokens are opaque strings of the form `"<sessionId>.<secret>"`:
 *
 * - `sessionId` is the `user_sessions` row id, so a presented token resolves to
 *   its session in O(1) (no table scan, no per-row hash compare).
 * - `secret` is 32 bytes of CSPRNG entropy. Only its sha256 hash is persisted.
 *
 * A high-entropy random secret does not need a slow password hash: sha256 is the
 * right tool (fast, fixed-width, no bcrypt 72-byte cap). The secret is never the
 * thing an attacker can brute-force offline — it has 256 bits of entropy.
 */

const SEPARATOR = '.';

export interface RefreshTokenParts {
  sessionId: string;
  secret: string;
}

/** Generate a fresh secret half plus its at-rest sha256 hash. */
export function generateRefreshSecret(): { secret: string; hash: string } {
  const secret = randomBytes(32).toString('base64url');
  return { secret, hash: hashRefreshSecret(secret) };
}

/** sha256 hex of a refresh-token secret — what gets stored in the session row. */
export function hashRefreshSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/** Compose the wire token from a session id and its secret. */
export function composeRefreshToken(sessionId: string, secret: string): string {
  return `${sessionId}${SEPARATOR}${secret}`;
}

/**
 * Split a wire token into its `sessionId` / `secret` halves, or `null` if it is
 * malformed (missing separator, empty half). Only splits on the FIRST separator
 * so a secret that happens to contain one is preserved.
 */
export function parseRefreshToken(token: string): RefreshTokenParts | null {
  const idx = token.indexOf(SEPARATOR);
  if (idx <= 0 || idx === token.length - 1) {
    return null;
  }
  return { sessionId: token.slice(0, idx), secret: token.slice(idx + 1) };
}

/**
 * Constant-time comparison of a presented secret against a stored hash. Hashing
 * the candidate first means both operands are fixed-width sha256 hex, so
 * `timingSafeEqual` never throws on a length mismatch and leaks no timing signal.
 */
export function refreshSecretMatches(secret: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashRefreshSecret(secret));
  const stored = Buffer.from(storedHash);
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}
