import { IsNotEmpty, IsString } from 'class-validator';
import type { RefreshInput } from '@repo/types';

export class RefreshDto implements RefreshInput {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
