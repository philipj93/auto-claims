import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ClaimStatus, ClaimType } from '@repo/types';

export class QueryClaimsDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsEnum(ClaimStatus)
  status?: ClaimStatus;

  @IsOptional()
  @IsEnum(ClaimType)
  type?: ClaimType;
}
