import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PolicyStatus } from '@repo/types';
import { numericTransformer } from '../common/numeric.transformer';
import { User } from './user.entity';
import { Claim } from './claim.entity';

@Entity({ name: 'policies' })
export class Policy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ name: 'policy_number' })
  policyNumber: string;

  @Column({
    type: 'enum',
    enum: PolicyStatus,
    default: PolicyStatus.ACTIVE,
  })
  status: PolicyStatus;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: numericTransformer })
  premium: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: numericTransformer })
  deductible: number;

  @Column({
    name: 'coverage_limit',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  coverageLimit: number;

  @Column({ name: 'effective_date', type: 'date' })
  effectiveDate: string;

  @Column({ name: 'expiration_date', type: 'date' })
  expirationDate: string;

  @ManyToOne(() => User, (user) => user.policies, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @OneToMany(() => Claim, (claim) => claim.policy)
  claims: Claim[];
}
