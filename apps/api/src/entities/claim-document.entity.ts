import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DocumentType } from '@repo/types';
import { Claim } from './claim.entity';

@Entity({ name: 'claim_documents' })
export class ClaimDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: DocumentType, default: DocumentType.OTHER })
  type: DocumentType;

  @Column({ name: 'file_name' })
  fileName: string;

  @Column()
  url: string;

  @ManyToOne(() => Claim, (claim) => claim.documents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'claim_id' })
  claim: Claim;

  @Column({ name: 'claim_id' })
  claimId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
