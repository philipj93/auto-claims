import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Claim } from './claim.entity';

@Entity({ name: 'claim_notes' })
export class ClaimNote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  author: string;

  @Column({ type: 'text' })
  body: string;

  @ManyToOne(() => Claim, (claim) => claim.notes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'claim_id' })
  claim: Claim;

  @Column({ name: 'claim_id' })
  claimId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
