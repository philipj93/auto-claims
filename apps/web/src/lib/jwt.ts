/**
 * Minimal, edge-safe JWT inspection. The web app never *verifies* tokens (the
 * API owns that); middleware only needs to peek at `exp` to decide whether to
 * proactively refresh, so this decodes the payload without any crypto.
 */

interface JwtClaims {
  exp?: number;
}

/** Decode a JWT's `exp` (seconds since epoch), or null if it can't be read. */
export function decodeJwtExp(token: string): number | null {
  const segments = token.split('.');
  if (segments.length !== 3) return null;
  try {
    const json = base64UrlDecode(segments[1]);
    const claims = JSON.parse(json) as JwtClaims;
    return typeof claims.exp === 'number' ? claims.exp : null;
  } catch {
    return null;
  }
}

/**
 * True if the token is expired (or within `skewSeconds` of it), or if `exp`
 * can't be read. An unreadable token is treated as expired so the caller falls
 * through to a refresh attempt rather than trusting a malformed token.
 */
export function isJwtExpired(token: string, skewSeconds = 10): boolean {
  const exp = decodeJwtExp(token);
  if (exp === null) return true;
  return Date.now() / 1000 >= exp - skewSeconds;
}

function base64UrlDecode(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  return atob(padded);
}
