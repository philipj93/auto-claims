import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import { ClaimType, CreateClaimInput } from '@repo/types';

export class CreateClaimDto implements CreateClaimInput {
  @IsUUID()
  userId: string;

  @IsUUID()
  vehicleId: string;

  @IsOptional()
  @IsUUID()
  policyId?: string;

  @IsEnum(ClaimType)
  type: ClaimType;

  @IsString()
  @MinLength(10)
  description: string;

  @IsDateString()
  incidentDate: string;

  @IsOptional()
  @IsString()
  incidentLocation?: string;

  @IsNumber()
  @Min(0)
  estimatedAmount: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  deductible?: number;

  @IsOptional()
  @IsBoolean()
  injuryReported?: boolean;

  @IsOptional()
  @IsString()
  policeReportNumber?: string;
}
