import { join } from 'path';
import { DataSourceOptions } from 'typeorm';
import { User } from '../entities/user.entity';
import { Vehicle } from '../entities/vehicle.entity';
import { Policy } from '../entities/policy.entity';
import { Claim } from '../entities/claim.entity';
import { ClaimDocument } from '../entities/claim-document.entity';
import { ClaimNote } from '../entities/claim-note.entity';
import { UserSession } from '../entities/user-session.entity';

export const entities = [User, Vehicle, Policy, Claim, ClaimDocument, ClaimNote, UserSession];

/**
 * Builds TypeORM connection options from environment variables.
 * Shared by the Nest application module and the standalone seed script.
 */
export function buildDataSourceOptions(): DataSourceOptions {
  return {
    type: 'postgres',
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME ?? 'claims_user',
    password: process.env.DB_PASSWORD ?? 'claims_pass',
    database: process.env.DB_NAME ?? 'claims_db',
    entities,
    // Resolved relative to this file so it works under both ts-node (src/*.ts)
    // and the compiled build (dist/*.js).
    migrations: [join(__dirname, '../migrations/*.{ts,js}')],
    synchronize: (process.env.DB_SYNCHRONIZE ?? 'true') === 'true',
    logging: (process.env.DB_LOGGING ?? 'false') === 'true',
  };
}
