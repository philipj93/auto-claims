import { beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SessionService } from './session.service';
import { UserSession } from '../entities/user-session.entity';
import { createMockRepository, type MockRepository } from '../../test/utils/mock-repository';
import {
  composeRefreshToken,
  generateRefreshSecret,
  hashRefreshSecret,
  parseRefreshToken,
} from './refresh-token';

/** A persisted session row with a known secret, for rotate/revoke tests. */
function sessionRow(overrides: Partial<UserSession> = {}): {
  row: UserSession;
  secret: string;
} {
  const { secret, hash } = generateRefreshSecret();
  const row = {
    id: 'sess-1',
    userId: 'user-1',
    refreshTokenHash: hash,
    userAgent: null,
    ip: null,
    lastUsedAt: new Date('2026-01-01T00:00:00Z'),
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as UserSession;
  return { row, secret };
}

describe('SessionService', () => {
  let service: SessionService;
  let repo: MockRepository<UserSession>;

  beforeEach(async () => {
    repo = createMockRepository<UserSession>();
    // Simulate the DB assigning an id on insert.
    repo.save.mockImplementation(async (s: UserSession) => ({ id: s.id ?? 'sess-1', ...s }));
    repo.delete.mockResolvedValue({ affected: 1, raw: [] });

    const moduleRef = await Test.createTestingModule({
      providers: [
        SessionService,
        { provide: getRepositoryToken(UserSession), useValue: repo },
        { provide: ConfigService, useValue: { get: (_k: string, d: string) => d } },
      ],
    }).compile();

    service = moduleRef.get(SessionService);
  });

  describe('create', () => {
    it('persists a hashed secret and returns a token carrying the session id', async () => {
      const token = await service.create('user-1', { userAgent: 'UA', ip: '1.2.3.4' });
      const parts = parseRefreshToken(token)!;

      expect(parts.sessionId).toBe('sess-1');
      const saved = repo.save.mock.calls[0][0];
      expect(saved.userId).toBe('user-1');
      expect(saved.userAgent).toBe('UA');
      expect(saved.ip).toBe('1.2.3.4');
      // stored at rest as the hash of the secret, never the secret itself
      expect(saved.refreshTokenHash).toBe(hashRefreshSecret(parts.secret));
      expect(saved.refreshTokenHash).not.toContain(parts.secret);
      expect(saved.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('rotate', () => {
    it('issues a new token and updates the stored hash', async () => {
      const { row, secret } = sessionRow();
      repo.findOne.mockResolvedValue(row);

      const result = await service.rotate(composeRefreshToken('sess-1', secret));
      const newParts = parseRefreshToken(result.refreshToken)!;

      expect(result.userId).toBe('user-1');
      expect(result.refreshToken).not.toBe(composeRefreshToken('sess-1', secret));
      expect(row.refreshTokenHash).toBe(hashRefreshSecret(newParts.secret)); // rotated
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it('revokes the session when an already-rotated token is reused', async () => {
      const { row } = sessionRow(); // stored hash belongs to the CURRENT secret
      repo.findOne.mockResolvedValue(row);

      // present a stale secret that no longer matches the stored hash
      await expect(
        service.rotate(composeRefreshToken('sess-1', 'an-old-rotated-secret')),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(repo.delete).toHaveBeenCalledWith({ id: 'sess-1' });
    });

    it('revokes and rejects an expired session', async () => {
      const { row, secret } = sessionRow({ expiresAt: new Date(Date.now() - 1_000) });
      repo.findOne.mockResolvedValue(row);

      await expect(service.rotate(composeRefreshToken('sess-1', secret))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(repo.delete).toHaveBeenCalledWith({ id: 'sess-1' });
    });

    it('rejects malformed or unknown tokens without revoking', async () => {
      await expect(service.rotate('garbage')).rejects.toBeInstanceOf(UnauthorizedException);

      repo.findOne.mockResolvedValue(null);
      await expect(service.rotate(composeRefreshToken('missing', 'x'))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(repo.delete).not.toHaveBeenCalled();
    });
  });

  describe('revoke', () => {
    it('deletes the session for a valid token', async () => {
      const { row, secret } = sessionRow();
      repo.findOne.mockResolvedValue(row);

      await service.revoke(composeRefreshToken('sess-1', secret));
      expect(repo.delete).toHaveBeenCalledWith({ id: 'sess-1' });
    });

    it('is a no-op for an invalid token or wrong secret (best-effort logout)', async () => {
      await service.revoke('garbage');
      expect(repo.delete).not.toHaveBeenCalled();

      const { row } = sessionRow();
      repo.findOne.mockResolvedValue(row);
      await service.revoke(composeRefreshToken('sess-1', 'wrong-secret'));
      expect(repo.delete).not.toHaveBeenCalled();
    });
  });

  describe('revokeAll', () => {
    it('deletes every session for the user', async () => {
      await service.revokeAll('user-1');
      expect(repo.delete).toHaveBeenCalledWith({ userId: 'user-1' });
    });
  });
});
