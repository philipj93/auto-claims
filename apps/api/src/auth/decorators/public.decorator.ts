import { SetMetadata } from '@nestjs/common';

/** Metadata key the JwtAuthGuard reads to allow unauthenticated access. */
export const IS_PUBLIC_KEY = 'isPublic';

/** Mark a route (or controller) as accessible without a valid JWT. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
