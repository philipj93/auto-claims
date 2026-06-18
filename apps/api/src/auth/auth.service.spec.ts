import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { makeUser } from '../../test/utils/fixtures';
import { hashPassword } from './hashing';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: {
    findByUsername: ReturnType<typeof vi.fn>;
    existsByUsernameOrEmail: ReturnType<typeof vi.fn>;
    createUser: ReturnType<typeof vi.fn>;
  };
  let jwt: { signAsync: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    usersService = {
      findByUsername: vi.fn(),
      existsByUsernameOrEmail: vi.fn(),
      createUser: vi.fn(),
    };
    jwt = { signAsync: vi.fn().mockResolvedValue('signed.jwt.token') };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwt },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  describe('login', () => {
    it('returns a token and safe user for valid credentials', async () => {
      const hash = await hashPassword('Sup3r$ecret');
      usersService.findByUsername.mockResolvedValue(makeUser({ username: 'ada', passwordHash: hash }));

      const result = await service.login({ username: 'ada', password: 'Sup3r$ecret' });

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.user).toMatchObject({ username: 'ada' });
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(jwt.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'ada' }),
      );
    });

    it('throws Unauthorized for an unknown user', async () => {
      usersService.findByUsername.mockResolvedValue(null);
      await expect(service.login({ username: 'nope', password: 'x' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('throws Unauthorized for a wrong password', async () => {
      const hash = await hashPassword('correct-pw');
      usersService.findByUsername.mockResolvedValue(makeUser({ passwordHash: hash }));
      await expect(
        service.login({ username: 'ada', password: 'wrong-pw' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
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

    it('creates a user and returns a token', async () => {
      usersService.existsByUsernameOrEmail.mockResolvedValue(false);
      usersService.createUser.mockResolvedValue(makeUser({ username: 'ada' }));

      const result = await service.register(body);

      expect(usersService.createUser).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'ada', email: 'ada@example.com' }),
      );
      // password is hashed, never stored raw
      const arg = usersService.createUser.mock.calls[0][0];
      expect(arg.passwordHash).not.toBe('Sup3r$ecret');
      expect(arg).not.toHaveProperty('password');
      expect(result.accessToken).toBe('signed.jwt.token');
    });

    it('throws Conflict when the username or email is taken', async () => {
      usersService.existsByUsernameOrEmail.mockResolvedValue(true);
      await expect(service.register(body)).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
