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

/** A persisted session row with a known secret, for verify/rotate/revoke tests. */
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

/** Build a SessionService over a mock repo, with a configurable TTL (days). */
async function buildService(ttlDays = '30'): Promise<{
  service: SessionService;
  repo: MockRepository<UserSession>;
}> {
  const repo = createMockRepository<UserSession>();
  repo.save.mockImplementation(async (s: UserSession) => ({ id: s.id ?? 'sess-1', ...s }));
  repo.delete.mockResolvedValue({ affected: 1, raw: [] });

  const moduleRef = await Test.createTestingModule({
    providers: [
      SessionService,
      { provide: getRepositoryToken(UserSession), useValue: repo },
      {
        provide: ConfigService,
        useValue: { get: (_k: string, d: string) => (ttlDays === '30' ? d : ttlDays) },
      },
    ],
  }).compile();

  return { service: moduleRef.get(SessionService), repo };
}

describe('SessionService', () => {
  let service: SessionService;
  let repo: MockRepository<UserSession>;

  beforeEach(async () => {
    ({ service, repo } = await buildService());
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

    it('honors REFRESH_TOKEN_EXPIRES_IN_DAYS for the expiry window', async () => {
      const seven = await buildService('7');
      const before = Date.now();
      await seven.service.create('user-1');
      const saved = seven.repo.save.mock.calls[0][0];
      const days = (saved.expiresAt.getTime() - before) / (24 * 60 * 60 * 1000);
      expect(days).toBeGreaterThan(6.9);
      expect(days).toBeLessThan(7.1);
    });
  });

  describe('verify', () => {
    it('returns the live session for a valid token without mutating it', async () => {
      const { row, secret } = sessionRow();
      repo.findOne.mockResolvedValue(row);

      const result = await service.verify(composeRefreshToken('sess-1', secret));

      expect(result).toBe(row);
      expect(repo.delete).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('revokes the session when an already-rotated token is reused', async () => {
      const { row } = sessionRow(); // stored hash belongs to the CURRENT secret
      repo.findOne.mockResolvedValue(row);

      await expect(
        service.verify(composeRefreshToken('sess-1', 'an-old-rotated-secret')),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(repo.delete).toHaveBeenCalledWith({ id: 'sess-1' });
    });

    it('revokes and rejects an expired session', async () => {
      const { row, secret } = sessionRow({ expiresAt: new Date(Date.now() - 1_000) });
      repo.findOne.mockResolvedValue(row);

      await expect(service.verify(composeRefreshToken('sess-1', secret))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(repo.delete).toHaveBeenCalledWith({ id: 'sess-1' });
    });

    it('rejects malformed or unknown tokens without revoking', async () => {
      await expect(service.verify('garbage')).rejects.toBeInstanceOf(UnauthorizedException);

      repo.findOne.mockResolvedValue(null);
      await expect(service.verify(composeRefreshToken('missing', 'x'))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(repo.delete).not.toHaveBeenCalled();
    });
  });

  describe('rotate', () => {
    it('issues a new token, updates the hash, and slides the expiry forward', async () => {
      const { row, secret } = sessionRow({ expiresAt: new Date(Date.now() + 1_000) });
      const previousExpiry = row.expiresAt.getTime();

      const token = await service.rotate(row, { ip: '9.9.9.9' });
      const newParts = parseRefreshToken(token)!;

      expect(token).not.toBe(composeRefreshToken('sess-1', secret));
      expect(row.refreshTokenHash).toBe(hashRefreshSecret(newParts.secret)); // rotated
      expect(row.expiresAt.getTime()).toBeGreaterThan(previousExpiry); // sliding window
      expect(row.lastUsedAt.getTime()).toBeGreaterThan(new Date('2026-01-01T00:00:00Z').getTime());
      expect(row.ip).toBe('9.9.9.9');
      expect(repo.save).toHaveBeenCalledWith(row);
    });

    it('leaves the fingerprint unchanged when meta omits a field (undefined)', async () => {
      const { row } = sessionRow({ userAgent: 'old-UA', ip: 'old-ip' });
      await service.rotate(row, { ip: 'new-ip' }); // userAgent omitted
      expect(row.userAgent).toBe('old-UA'); // preserved
      expect(row.ip).toBe('new-ip'); // updated
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
