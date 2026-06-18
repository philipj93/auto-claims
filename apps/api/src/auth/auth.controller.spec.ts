import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { makeUser } from '../../test/utils/fixtures';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: { login: ReturnType<typeof vi.fn>; register: ReturnType<typeof vi.fn>; toAuthUser: ReturnType<typeof vi.fn> };
  let usersService: { findOne: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    authService = { login: vi.fn(), register: vi.fn(), toAuthUser: vi.fn((u) => ({ id: u.id, username: u.username })) };
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

  it('POST /login delegates to AuthService.login', async () => {
    authService.login.mockResolvedValue({ accessToken: 't', user: { username: 'ada' } });
    const body = { username: 'ada', password: 'pw' };
    expect(await controller.login(body as never)).toEqual({ accessToken: 't', user: { username: 'ada' } });
    expect(authService.login).toHaveBeenCalledWith(body);
  });

  it('POST /register delegates to AuthService.register', async () => {
    authService.register.mockResolvedValue({ accessToken: 't', user: { username: 'ada' } });
    const body = { username: 'ada', email: 'a@b.com', password: 'Sup3r$ecret', firstName: 'A', lastName: 'B' };
    await controller.register(body as never);
    expect(authService.register).toHaveBeenCalledWith(body);
  });

  it('GET /me re-loads the full user and returns the safe view', async () => {
    usersService.findOne.mockResolvedValue(makeUser({ id: 'user-1', username: 'ada' }));
    const result = await controller.me({ id: 'user-1', username: 'ada', email: '', firstName: '', lastName: '' });
    expect(usersService.findOne).toHaveBeenCalledWith('user-1');
    expect(result).toMatchObject({ username: 'ada' });
  });
});
