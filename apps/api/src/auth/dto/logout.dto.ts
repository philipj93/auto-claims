import { IsNotEmpty, IsString } from 'class-validator';
import type { LogoutInput } from '@repo/types';

export class LogoutDto implements LogoutInput {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
