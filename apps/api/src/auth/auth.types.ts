import type { AuthUser } from '@repo/types';

/** Shape attached to `request.user` after the JwtAuthGuard verifies a token. */
export type RequestUser = AuthUser;
