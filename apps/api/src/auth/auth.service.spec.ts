import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { UsersService } from '../users/users.service';
import { makeUser } from '../../test/utils/fixtures';
import { hashPassword } from './hashing';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: {
    findByUsername: ReturnType<typeof vi.fn>;
    existsByUsernameOrEmail: ReturnType<typeof vi.fn>;
    createUser: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
  };
  let jwt: { signAsync: ReturnType<typeof vi.fn> };
  let sessions: {
    create: ReturnType<typeof vi.fn>;
    rotate: ReturnType<typeof vi.fn>;
    revoke: ReturnType<typeof vi.fn>;
    revokeAll: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    usersService = {
      findByUsername: vi.fn(),
      existsByUsernameOrEmail: vi.fn(),
      createUser: vi.fn(),
      findOne: vi.fn(),
    };
    jwt = { signAsync: vi.fn().mockResolvedValue('signed.jwt.token') };
    sessions = {
      create: vi.fn().mockResolvedValue('refresh.token.value'),
      rotate: vi.fn(),
      revoke: vi.fn(),
      revokeAll: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwt },
        { provide: SessionService, useValue: sessions },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  describe('login', () => {
    it('returns an access + refresh token and safe user for valid credentials', async () => {
      const hash = await hashPassword('Sup3r$ecret');
      usersService.findByUsername.mockResolvedValue(
        makeUser({ id: 'user-1', username: 'ada', passwordHash: hash }),
      );

      const result = await service.login(
        { username: 'ada', password: 'Sup3r$ecret' },
        { userAgent: 'UA', ip: '1.2.3.4' },
      );

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.refreshToken).toBe('refresh.token.value');
      expect(result.user).toMatchObject({ username: 'ada' });
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(jwt.signAsync).toHaveBeenCalledWith(expect.objectContaining({ username: 'ada' }));
      // a session is opened for the user, carrying the client fingerprint
      expect(sessions.create).toHaveBeenCalledWith('user-1', { userAgent: 'UA', ip: '1.2.3.4' });
    });

    it('throws Unauthorized for an unknown user', async () => {
      usersService.findByUsername.mockResolvedValue(null);
      await expect(service.login({ username: 'nope', password: 'x' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(sessions.create).not.toHaveBeenCalled();
    });

    it('throws Unauthorized for a wrong password', async () => {
      const hash = await hashPassword('correct-pw');
      usersService.findByUsername.mockResolvedValue(makeUser({ passwordHash: hash }));
      await expect(service.login({ username: 'ada', password: 'wrong-pw' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('register', () => {
    const body = {
      username: 'ada',
      email: 'ada@example.com',
      password: 'Sup3r$ecret',
      firstName: 'Ada',
      lastName: 'Lovelace',
    };

    it('creates a user and returns both tokens', async () => {
      usersService.existsByUsernameOrEmail.mockResolvedValue(false);
      usersService.createUser.mockResolvedValue(makeUser({ id: 'user-1', username: 'ada' }));

      const result = await service.register(body);

      expect(usersService.createUser).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'ada', email: 'ada@example.com' }),
      );
      // password is hashed, never stored raw
      const arg = usersService.createUser.mock.calls[0][0];
      expect(arg.passwordHash).not.toBe('Sup3r$ecret');
      expect(arg).not.toHaveProperty('password');
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.refreshToken).toBe('refresh.token.value');
      expect(sessions.create).toHaveBeenCalledWith('user-1', undefined);
    });

    it('throws Conflict when the username or email is taken', async () => {
      usersService.existsByUsernameOrEmail.mockResolvedValue(true);
      await expect(service.register(body)).rejects.toBeInstanceOf(ConflictException);
      expect(sessions.create).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('rotates the refresh token and mints a fresh access token', async () => {
      sessions.rotate.mockResolvedValue({ userId: 'user-1', refreshToken: 'rotated.token' });
      usersService.findOne.mockResolvedValue(makeUser({ id: 'user-1', username: 'ada' }));

      const result = await service.refresh('old.token', { userAgent: 'UA', ip: '1.2.3.4' });

      expect(sessions.rotate).toHaveBeenCalledWith('old.token', {
        userAgent: 'UA',
        ip: '1.2.3.4',
      });
      expect(result.refreshToken).toBe('rotated.token');
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(jwt.signAsync).toHaveBeenCalledWith(expect.objectContaining({ sub: 'user-1' }));
    });

    it('propagates Unauthorized from a rejected rotation', async () => {
      sessions.rotate.mockRejectedValue(new UnauthorizedException());
      await expect(service.refresh('bad.token')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(jwt.signAsync).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('revokes the session behind the refresh token', async () => {
      await service.logout('some.token');
      expect(sessions.revoke).toHaveBeenCalledWith('some.token');
    });

    it('revokes every session for the user on logout-all', async () => {
      await service.logoutAll('user-1');
      expect(sessions.revokeAll).toHaveBeenCalledWith('user-1');
    });
  });
});
