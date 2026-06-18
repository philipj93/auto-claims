import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { JwtPayload } from '@repo/types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { RequestUser } from '../auth.types';

/**
 * Global guard (registered via APP_GUARD). Routes are protected by default;
 * a `@Public()` route is allowed straight through. Otherwise the `Authorization:
 * Bearer <jwt>` header is verified and the decoded user attached to the request.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: RequestUser;
    }>();
    const token = this.extractToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // The token carries only id + username; full profile fields are not needed
    // to authorize a request, so attach what the claims provide.
    request.user = {
      id: payload.sub,
      username: payload.username,
      email: '',
      firstName: '',
      lastName: '',
    };
    return true;
  }

  private extractToken(header: string | undefined): string | undefined {
    const [type, token] = header?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
