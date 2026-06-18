import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, FindOptionsWhere, Repository } from 'typeorm';
import { ClaimStatus } from '@repo/types';
import { Claim } from '../entities/claim.entity';
import { ClaimNote } from '../entities/claim-note.entity';
import { Vehicle } from '../entities/vehicle.entity';
import { CreateClaimDto } from './dto/create-claim.dto';
import { UpdateClaimStatusDto } from './dto/update-claim-status.dto';
import { QueryClaimsDto } from './dto/query-claims.dto';

@Injectable()
export class ClaimsService {
  constructor(
    @InjectRepository(Claim)
    private readonly claims: Repository<Claim>,
    @InjectRepository(Vehicle)
    private readonly vehicles: Repository<Vehicle>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(query: QueryClaimsDto): Promise<Claim[]> {
    const where: FindOptionsWhere<Claim> = {};
    if (query.userId) where.userId = query.userId;
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;

    return this.claims.find({
      where,
      relations: { user: true, vehicle: true },
      order: { reportedDate: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Claim> {
    const claim = await this.claims.findOne({
      where: { id },
      relations: {
        user: true,
        vehicle: true,
        policy: true,
        documents: true,
        notes: true,
      },
      order: { notes: { createdAt: 'DESC' } },
    });
    if (!claim) {
      throw new NotFoundException(`Claim ${id} not found`);
    }
    return claim;
  }

  async create(dto: CreateClaimDto): Promise<Claim> {
    const vehicle = await this.vehicles.findOne({
      where: { id: dto.vehicleId },
    });
    if (!vehicle) {
      throw new BadRequestException(`Vehicle ${dto.vehicleId} not found`);
    }
    if (vehicle.userId !== dto.userId) {
      throw new BadRequestException('Vehicle does not belong to the given user');
    }

    const claim = this.claims.create({
      ...dto,
      incidentDate: new Date(dto.incidentDate),
      reportedDate: new Date(),
      deductible: dto.deductible ?? 0,
      injuryReported: dto.injuryReported ?? false,
      status: ClaimStatus.SUBMITTED,
      claimNumber: this.generateClaimNumber(),
    });

    const saved = await this.claims.save(claim);
    return this.findOne(saved.id);
  }

  async updateStatus(id: string, dto: UpdateClaimStatusDto): Promise<Claim> {
    // A status change must also record an audit note, and the two writes
    // (claim UPDATE + note INSERT) must succeed or fail together.
    // dataSource.transaction() runs the callback inside a single transaction,
    // committing if it resolves and rolling back if it throws — and handles
    // connection release for us. Every query must use the supplied `manager`
    // (NOT this.claims) so it runs on the transactional connection.
    await this.dataSource.transaction(async (manager) => {
      const claim = await manager.findOne(Claim, { where: { id } });
      if (!claim) {
        throw new NotFoundException(`Claim ${id} not found`);
      }

      const previousStatus = claim.status;

      claim.status = dto.status;
      if (dto.approvedAmount !== undefined) {
        claim.approvedAmount = dto.approvedAmount;
      }
      if (dto.adjusterName !== undefined) {
        claim.adjusterName = dto.adjusterName;
      }
      await manager.save(claim);

      const note = manager.create(ClaimNote, {
        claimId: claim.id,
        author: dto.adjusterName ?? 'system',
        body:
          `Status changed from ${previousStatus} to ${dto.status}` +
          (dto.approvedAmount !== undefined
            ? ` · approved amount set to ${dto.approvedAmount}`
            : ''),
      });
      await manager.save(note);
    });

    return this.findOne(id);
  }

  private generateClaimNumber(): string {
    const year = new Date().getFullYear();
    const rand = Math.floor(100000 + Math.random() * 900000);
    return `CLM-${year}-${rand}`;
  }
}
