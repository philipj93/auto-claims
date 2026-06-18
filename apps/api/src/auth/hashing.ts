import * as bcrypt from 'bcrypt';

/** Work factor for bcrypt — matches the NestJS docs' recommended default. */
const SALT_ROUNDS = 10;

/** Hash a plaintext password for storage. */
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/** Constant-time compare of a plaintext password against a stored bcrypt hash. */
export function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
