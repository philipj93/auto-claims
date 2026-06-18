import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ClaimStatus, ClaimType, FaultDetermination } from '@repo/types';
import { numericTransformer } from '../common/numeric.transformer';
import { User } from './user.entity';
import { Vehicle } from './vehicle.entity';
import { Policy } from './policy.entity';
import { ClaimDocument } from './claim-document.entity';
import { ClaimNote } from './claim-note.entity';

@Entity({ name: 'claims' })
export class Claim {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ name: 'claim_number' })
  claimNumber: string;

  @Index()
  @Column({ type: 'enum', enum: ClaimStatus, default: ClaimStatus.SUBMITTED })
  status: ClaimStatus;

  @Column({ type: 'enum', enum: ClaimType })
  type: ClaimType;

  @Column({
    name: 'fault_determination',
    type: 'enum',
    enum: FaultDetermination,
    default: FaultDetermination.UNDETERMINED,
  })
  faultDetermination: FaultDetermination;

  @Column({ type: 'text' })
  description: string;

  @Column({ name: 'incident_date', type: 'timestamptz' })
  incidentDate: Date;

  @Column({ name: 'reported_date', type: 'timestamptz' })
  reportedDate: Date;

  @Column({ name: 'incident_location', type: 'varchar', nullable: true })
  incidentLocation: string | null;

  @Column({
    name: 'estimated_amount',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  estimatedAmount: number;

  @Column({
    name: 'approved_amount',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  approvedAmount: number | null;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  deductible: number;

  @Column({ name: 'injury_reported', type: 'boolean', default: false })
  injuryReported: boolean;

  @Column({ name: 'police_report_number', type: 'varchar', nullable: true })
  policeReportNumber: string | null;

  @Column({ name: 'adjuster_name', type: 'varchar', nullable: true })
  adjusterName: string | null;

  @Index()
  @ManyToOne(() => User, (user) => user.claims, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => Vehicle, (vehicle) => vehicle.claims, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle: Vehicle;

  @Column({ name: 'vehicle_id', type: 'uuid', nullable: true })
  vehicleId: string | null;

  @ManyToOne(() => Policy, (policy) => policy.claims, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'policy_id' })
  policy: Policy | null;

  @Column({ name: 'policy_id', type: 'uuid', nullable: true })
  policyId: string | null;

  @OneToMany(() => ClaimDocument, (doc) => doc.claim, { cascade: true })
  documents: ClaimDocument[];

  @OneToMany(() => ClaimNote, (note) => note.claim, { cascade: true })
  notes: ClaimNote[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
