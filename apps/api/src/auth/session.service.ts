import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { UserSession } from '../entities/user-session.entity';
import {
  composeRefreshToken,
  generateRefreshSecret,
  parseRefreshToken,
  refreshSecretMatches,
} from './refresh-token';

/**
 * Best-effort client fingerprint stored alongside a session. A field that is
 * `undefined` means "not provided" — on {@link SessionService.rotate} it leaves
 * the stored value unchanged; an explicit `null` clears it. On `create` both
 * collapse to `null`.
 */
export interface SessionMeta {
  userAgent?: string | null;
  ip?: string | null;
}

/**
 * Owns the `user_sessions` table: opening, rotating, and revoking refresh-token
 * sessions. The raw refresh token never leaves this service except as a return
 * value — only its sha256 hash is persisted.
 */
@Injectable()
export class SessionService {
  /** Refresh-token lifetime in days; each rotation slides the window forward. */
  private readonly refreshTtlDays: number;

  constructor(
    @InjectRepository(UserSession)
    private readonly sessions: Repository<UserSession>,
    config: ConfigService,
  ) {
    this.refreshTtlDays = parseInt(config.get<string>('REFRESH_TOKEN_EXPIRES_IN_DAYS', '30'), 10);
  }

  /** Open a new session for a user and return its raw refresh token. */
  async create(userId: string, meta: SessionMeta = {}): Promise<string> {
    const { secret, hash } = generateRefreshSecret();
    const now = new Date();
    const session = await this.sessions.save(
      this.sessions.create({
        userId,
        refreshTokenHash: hash,
        userAgent: meta.userAgent ?? null,
        ip: meta.ip ?? null,
        lastUsedAt: now,
        expiresAt: this.expiryFrom(now),
      }),
    );
    return composeRefreshToken(session.id, secret);
  }

  /**
   * Validate a refresh token and return its live session — **without mutating**
   * it. Throws 401 on any failure. Presenting a token whose secret no longer
   * matches the stored hash (an already-rotated token) destroys the session —
   * the reuse / theft signal. Kept separate from {@link rotate} so the caller
   * can do its own fallible work (e.g. minting an access token) *before* the
   * token is rotated; that way a later failure can't strand the client with an
   * already-invalidated token and trip a false reuse signal on its next refresh.
   */
  async verify(rawToken: string): Promise<UserSession> {
    const parts = parseRefreshToken(rawToken);
    if (!parts) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const session = await this.sessions.findOne({ where: { id: parts.sessionId } });
    if (!session) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!refreshSecretMatches(parts.secret, session.refreshTokenHash)) {
      // A rotated (or forged) token was replayed — revoke the entire session.
      await this.sessions.delete({ id: session.id });
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      await this.sessions.delete({ id: session.id });
      throw new UnauthorizedException('Refresh token has expired');
    }

    return session;
  }

  /**
   * Rotate a previously-{@link verify}d session: mint a new secret, slide the
   * expiry window forward, refresh the client fingerprint, and return the new
   * raw refresh token. This is the last fallible step in a refresh, so it runs
   * after the access token has already been signed.
   */
  async rotate(session: UserSession, meta: SessionMeta = {}): Promise<string> {
    const { secret, hash } = generateRefreshSecret();
    const now = new Date();
    session.refreshTokenHash = hash;
    session.lastUsedAt = now;
    session.expiresAt = this.expiryFrom(now);
    if (meta.userAgent !== undefined) session.userAgent = meta.userAgent ?? null;
    if (meta.ip !== undefined) session.ip = meta.ip ?? null;
    await this.sessions.save(session);
    return composeRefreshToken(session.id, secret);
  }

  /**
   * Revoke the session behind a refresh token. Idempotent and best-effort: an
   * invalid, expired, or already-deleted token is a silent no-op, so logout
   * always succeeds. Requires the secret to match, so a leaked session id alone
   * can never destroy another user's session.
   */
  async revoke(rawToken: string): Promise<void> {
    const parts = parseRefreshToken(rawToken);
    if (!parts) return;
    const session = await this.sessions.findOne({ where: { id: parts.sessionId } });
    if (!session) return;
    if (!refreshSecretMatches(parts.secret, session.refreshTokenHash)) return;
    await this.sessions.delete({ id: session.id });
  }

  /** Revoke every session for a user (sign out everywhere). */
  async revokeAll(userId: string): Promise<void> {
    await this.sessions.delete({ userId });
  }

  private expiryFrom(from: Date): Date {
    return new Date(from.getTime() + this.refreshTtlDays * 24 * 60 * 60 * 1000);
  }
}
