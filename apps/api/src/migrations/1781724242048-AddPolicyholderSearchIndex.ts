import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPolicyholderSearchIndex1781724242048 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Trigram matching for fuzzy policyholder search (UsersService.search).
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
        // Expression MUST match UsersService.SEARCH_EXPR exactly, or this index
        // can't accelerate the similarity() query.
        await queryRunner.query(
            `CREATE INDEX "IDX_users_search_trgm" ON "users" USING gin ` +
                `((first_name || ' ' || last_name || ' ' || email || ' ' || COALESCE(phone, '')) gin_trgm_ops)`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_users_search_trgm"`);
        // Leave the pg_trgm extension in place; dropping it could break other objects.
    }

}
