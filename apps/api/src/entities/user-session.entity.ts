import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

/**
 * One row per refresh-token session. The refresh token itself is never stored —
 * only the sha256 hash of its secret half (`refreshTokenHash`). The token's id
 * half is this row's `id`, so a presented token resolves to its session in O(1).
 * Deleting a row revokes the session; `expiresAt` bounds its lifetime.
 */
@Entity({ name: 'user_sessions' })
export class UserSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /** sha256 hex of the refresh token's secret half — never the token itself. */
  @Column({ name: 'refresh_token_hash', type: 'varchar', length: 64 })
  refreshTokenHash: string;

  /** User-agent of the client that created/last-rotated the session (best-effort). */
  @Column({ name: 'user_agent', type: 'varchar', nullable: true })
  userAgent: string | null;

  /** Originating IP of the client (best-effort; behind a trusted proxy). */
  @Column({ type: 'varchar', nullable: true })
  ip: string | null;

  /**
   * Last time this session minted an access token. Recorded for future
   * idle-timeout / "active sessions" features; expiry is currently bounded only
   * by `expiresAt` (slid forward on each rotation).
   */
  @Column({ name: 'last_used_at', type: 'timestamptz' })
  lastUsedAt: Date;

  @Index()
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
