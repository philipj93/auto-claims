import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Claim } from '../entities/claim.entity';
import { Vehicle } from '../entities/vehicle.entity';
import { ClaimsController } from './claims.controller';
import { ClaimsService } from './claims.service';

@Module({
  imports: [TypeOrmModule.forFeature([Claim, Vehicle])],
  controllers: [ClaimsController],
  providers: [ClaimsService],
})
export class ClaimsModule {}
