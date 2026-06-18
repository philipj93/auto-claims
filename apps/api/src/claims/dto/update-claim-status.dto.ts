import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ClaimStatus, UpdateClaimStatusInput } from '@repo/types';

export class UpdateClaimStatusDto implements UpdateClaimStatusInput {
  @IsEnum(ClaimStatus)
  status: ClaimStatus;

  @IsOptional()
  @IsNumber()
  @Min(0)
  approvedAmount?: number;

  @IsOptional()
  @IsString()
  adjusterName?: string;
}
