import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { LoginInput } from '@repo/types';

/** Body for POST /api/auth/login. Validation is intentionally light. */
export class LoginDto implements LoginInput {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  username: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  password: string;
}
