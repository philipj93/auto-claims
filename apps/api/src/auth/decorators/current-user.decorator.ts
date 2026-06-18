import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { RequestUser } from '../auth.types';

/** Inject the authenticated user (set by JwtAuthGuard) into a handler param. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    const request = ctx.switchToHttp().getRequest<{ user: RequestUser }>();
    return request.user;
  },
);
