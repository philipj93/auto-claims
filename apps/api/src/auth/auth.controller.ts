import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Ip, Post } from '@nestjs/common';
import type { AuthResponse, AuthUser, RefreshResponse } from '@repo/types';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshDto } from './dto/refresh.dto';
import { LogoutDto } from './dto/logout.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import type { RequestUser } from './auth.types';
import type { SessionMeta } from './session.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  /** POST /api/auth/register — create an account, open a session, return tokens. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Public()
  @Post('register')
  register(
    @Body() dto: RegisterDto,
    @Headers('user-agent') userAgent: string | undefined,
    @Ip() ip: string,
  ): Promise<AuthResponse> {
    return this.auth.register(dto, sessionMeta(userAgent, ip));
  }

  /** POST /api/auth/login — exchange credentials for an access + refresh token. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(
    @Body() dto: LoginDto,
    @Headers('user-agent') userAgent: string | undefined,
    @Ip() ip: string,
  ): Promise<AuthResponse> {
    return this.auth.login(dto, sessionMeta(userAgent, ip));
  }

  /** POST /api/auth/refresh — rotate the refresh token and mint a new access token. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(
    @Body() dto: RefreshDto,
    @Headers('user-agent') userAgent: string | undefined,
    @Ip() ip: string,
  ): Promise<RefreshResponse> {
    return this.auth.refresh(dto.refreshToken, sessionMeta(userAgent, ip));
  }

  /** POST /api/auth/logout — revoke the session behind this refresh token. */
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  logout(@Body() dto: LogoutDto): Promise<void> {
    return this.auth.logout(dto.refreshToken);
  }

  /** POST /api/auth/logout-all — revoke every session for the current user. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout-all')
  logoutAll(@CurrentUser() current: RequestUser): Promise<void> {
    return this.auth.logoutAll(current.id);
  }

  /** GET /api/auth/me — the authenticated user's full profile. */
  @Get('me')
  async me(@CurrentUser() current: RequestUser): Promise<AuthUser> {
    const user = await this.users.findOne(current.id);
    return this.auth.toAuthUser(user);
  }
}

/** Build the best-effort client fingerprint stored on a session row. */
function sessionMeta(userAgent: string | undefined, ip: string): SessionMeta {
  return { userAgent: userAgent ?? null, ip: ip || null };
}
