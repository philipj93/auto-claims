import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthResponse, AuthUser, JwtPayload } from '@repo/types';
import { User } from '../entities/user.entity';
import { UsersService } from '../users/users.service';
import { comparePassword, hashPassword } from './hashing';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  /** Verify credentials and issue a token, or throw 401. */
  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.users.findByUsername(dto.username);
    if (!user || !(await comparePassword(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid username or password');
    }
    return this.sign(user);
  }

  /** Create a new account (409 if taken) and issue a token. */
  async register(dto: RegisterDto): Promise<AuthResponse> {
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
    return this.sign(user);
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

  private async sign(user: User): Promise<AuthResponse> {
    const payload: JwtPayload = { sub: user.id, username: user.username };
    const accessToken = await this.jwt.signAsync(payload);
    return { accessToken, user: this.toAuthUser(user) };
  }
}
