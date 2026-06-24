import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { makeUser } from '../../test/utils/fixtures';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    login: ReturnType<typeof vi.fn>;
    register: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
    logoutAll: ReturnType<typeof vi.fn>;
    toAuthUser: ReturnType<typeof vi.fn>;
  };
  let usersService: { findOne: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    authService = {
      login: vi.fn(),
      register: vi.fn(),
      refresh: vi.fn(),
      logout: vi.fn(),
      logoutAll: vi.fn(),
      toAuthUser: vi.fn((u) => ({ id: u.id, username: u.username })),
    };
    usersService = { findOne: vi.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();

    controller = moduleRef.get(AuthController);
  });

  it('POST /login delegates to AuthService.login with the client fingerprint', async () => {
    authService.login.mockResolvedValue({ accessToken: 't', refreshToken: 'r', user: {} });
    const body = { username: 'ada', password: 'pw' };
    await controller.login(body as never, 'UA', '1.2.3.4');
    expect(authService.login).toHaveBeenCalledWith(body, { userAgent: 'UA', ip: '1.2.3.4' });
  });

  it('POST /register delegates to AuthService.register with the client fingerprint', async () => {
    authService.register.mockResolvedValue({ accessToken: 't', refreshToken: 'r', user: {} });
    const body = {
      username: 'ada',
      email: 'a@b.com',
      password: 'Sup3r$ecret',
      firstName: 'A',
      lastName: 'B',
    };
    await controller.register(body as never, undefined, '');
    // a missing user-agent / ip collapse to null
    expect(authService.register).toHaveBeenCalledWith(body, { userAgent: null, ip: null });
  });

  it('POST /refresh delegates to AuthService.refresh', async () => {
    authService.refresh.mockResolvedValue({ accessToken: 't2', refreshToken: 'r2' });
    const result = await controller.refresh({ refreshToken: 'r1' } as never, 'UA', '1.2.3.4');
    expect(authService.refresh).toHaveBeenCalledWith('r1', { userAgent: 'UA', ip: '1.2.3.4' });
    expect(result).toEqual({ accessToken: 't2', refreshToken: 'r2' });
  });

  it('POST /logout delegates to AuthService.logout', async () => {
    await controller.logout({ refreshToken: 'r1' } as never);
    expect(authService.logout).toHaveBeenCalledWith('r1');
  });

  it('POST /logout-all delegates to AuthService.logoutAll for the current user', async () => {
    await controller.logoutAll({ id: 'user-1' } as never);
    expect(authService.logoutAll).toHaveBeenCalledWith('user-1');
  });

  it('GET /me re-loads the full user and returns the safe view', async () => {
    usersService.findOne.mockResolvedValue(makeUser({ id: 'user-1', username: 'ada' }));
    const result = await controller.me({
      id: 'user-1',
      username: 'ada',
      email: '',
      firstName: '',
      lastName: '',
    });
    expect(usersService.findOne).toHaveBeenCalledWith('user-1');
    expect(result).toMatchObject({ username: 'ada' });
  });
});
