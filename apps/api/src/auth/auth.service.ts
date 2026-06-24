import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthResponse, AuthUser, JwtPayload, RefreshResponse } from '@repo/types';
import { User } from '../entities/user.entity';
import { UsersService } from '../users/users.service';
import { comparePassword, hashPassword } from './hashing';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SessionService, type SessionMeta } from './session.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly sessions: SessionService,
  ) {}

  /** Verify credentials and open a session, or throw 401. */
  async login(dto: LoginDto, meta?: SessionMeta): Promise<AuthResponse> {
    const user = await this.users.findByUsername(dto.username);
    if (!user || !(await comparePassword(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid username or password');
    }
    return this.issue(user, meta);
  }

  /** Create a new account (409 if taken) and open a session. */
  async register(dto: RegisterDto, meta?: SessionMeta): Promise<AuthResponse> {
    if (await this.users.existsByUsernameOrEmail(dto.username, dto.email)) {
      throw new ConflictException('Username or email is already in use');
    }
    const passwordHash = await hashPassword(dto.password);
    const user = await this.users.createUser({
      username: dto.username,
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      passwordHash,
    });
    return this.issue(user, meta);
  }

  /**
   * Rotate a refresh token and mint a fresh access token. The presented refresh
   * token is invalid after this call; reuse of it revokes the session (handled
   * in SessionService.verify).
   *
   * Order matters: validate the session and sign the new access token *before*
   * rotating. Rotation is the last fallible step, so a failure here (e.g. the
   * user was deleted) can't leave the client holding an already-invalidated
   * token that would trip a false reuse signal on the next refresh.
   */
  async refresh(refreshToken: string, meta?: SessionMeta): Promise<RefreshResponse> {
    const session = await this.sessions.verify(refreshToken);
    const user = await this.users.findAuthById(session.userId);
    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const accessToken = await this.signAccessToken(user);
    const rotated = await this.sessions.rotate(session, meta);
    return { accessToken, refreshToken: rotated };
  }

  /** Revoke the session behind a refresh token (single-device logout). */
  async logout(refreshToken: string): Promise<void> {
    await this.sessions.revoke(refreshToken);
  }

  /** Revoke every session for a user (sign out everywhere). */
  async logoutAll(userId: string): Promise<void> {
    await this.sessions.revokeAll(userId);
  }

  /** Project an entity to the safe public shape — never exposes the hash. */
  toAuthUser(user: User): AuthUser {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  }

  /** Sign an access token and open a fresh session for the user. */
  private async issue(user: User, meta?: SessionMeta): Promise<AuthResponse> {
    const accessToken = await this.signAccessToken(user);
    const refreshToken = await this.sessions.create(user.id, meta);
    return { accessToken, refreshToken, user: this.toAuthUser(user) };
  }

  private signAccessToken(user: Pick<User, 'id' | 'username'>): Promise<string> {
    const payload: JwtPayload = { sub: user.id, username: user.username };
    return this.jwt.signAsync(payload);
  }
}
