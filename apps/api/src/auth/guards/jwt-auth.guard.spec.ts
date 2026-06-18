import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';

function contextWith(headers: Record<string, string>): ExecutionContext {
  const request = { headers, user: undefined };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  let reflector: Reflector;
  let jwt: { verifyAsync: ReturnType<typeof vi.fn> };
  let guard: JwtAuthGuard;

  beforeEach(() => {
    reflector = new Reflector();
    jwt = { verifyAsync: vi.fn() };
    guard = new JwtAuthGuard(reflector, jwt as unknown as JwtService);
  });

  it('allows public routes without a token', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    expect(await guard.canActivate(contextWith({}))).toBe(true);
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it('rejects a protected route with no Authorization header', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    await expect(guard.canActivate(contextWith({}))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an invalid/expired token', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    jwt.verifyAsync.mockRejectedValue(new Error('expired'));
    await expect(
      guard.canActivate(contextWith({ authorization: 'Bearer bad.token' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts a valid token and attaches the user to the request', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', username: 'ada' });
    const ctx = contextWith({ authorization: 'Bearer good.token' });
    const request = ctx.switchToHttp().getRequest<{ user: unknown }>();

    expect(await guard.canActivate(ctx)).toBe(true);
    expect(request.user).toMatchObject({ id: 'user-1', username: 'ada' });
  });
});
