import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Claim } from './claim.entity';

@Entity({ name: 'vehicles' })
export class Vehicle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  make: string;

  @Column()
  model: string;

  @Column({ type: 'int' })
  year: number;

  @Index({ unique: true })
  @Column()
  vin: string;

  @Column({ name: 'license_plate', type: 'varchar', nullable: true })
  licensePlate: string | null;

  @Column({ type: 'varchar', nullable: true })
  color: string | null;

  @ManyToOne(() => User, (user) => user.vehicles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @OneToMany(() => Claim, (claim) => claim.vehicle)
  claims: Claim[];
}
