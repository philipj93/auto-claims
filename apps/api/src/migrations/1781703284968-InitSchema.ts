import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1781703284968 implements MigrationInterface {
  name = 'InitSchema1781703284968';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Required for the uuid_generate_v4() column defaults below. `synchronize`
    // installs this automatically; migrations must do it explicitly.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(
      `CREATE TABLE "vehicles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "make" character varying NOT NULL, "model" character varying NOT NULL, "year" integer NOT NULL, "vin" character varying NOT NULL, "license_plate" character varying, "color" character varying, "user_id" uuid NOT NULL, CONSTRAINT "PK_18d8646b59304dce4af3a9e35b6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_8288ce015b69c5856cf54e07a6" ON "vehicles" ("vin") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."policies_status_enum" AS ENUM('ACTIVE', 'LAPSED', 'CANCELLED', 'EXPIRED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "policies" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "policy_number" character varying NOT NULL, "status" "public"."policies_status_enum" NOT NULL DEFAULT 'ACTIVE', "premium" numeric(10,2) NOT NULL, "deductible" numeric(10,2) NOT NULL, "coverage_limit" numeric(12,2) NOT NULL, "effective_date" date NOT NULL, "expiration_date" date NOT NULL, "user_id" uuid NOT NULL, CONSTRAINT "PK_603e09f183df0108d8695c57e28" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_0a3ff12ee86e399e522e8ec7ce" ON "policies" ("policy_number") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."claim_documents_type_enum" AS ENUM('PHOTO', 'POLICE_REPORT', 'ESTIMATE', 'INVOICE', 'CORRESPONDENCE', 'OTHER')`,
    );
    await queryRunner.query(
      `CREATE TABLE "claim_documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "type" "public"."claim_documents_type_enum" NOT NULL DEFAULT 'OTHER', "file_name" character varying NOT NULL, "url" character varying NOT NULL, "claim_id" uuid NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_926ac9a44ec173769f00b65b841" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "claim_notes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "author" character varying NOT NULL, "body" text NOT NULL, "claim_id" uuid NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_bb02221b94e8a925904b02835e3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."claims_status_enum" AS ENUM('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'DENIED', 'PAID', 'CLOSED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."claims_type_enum" AS ENUM('COLLISION', 'COMPREHENSIVE', 'LIABILITY', 'UNINSURED_MOTORIST', 'PERSONAL_INJURY', 'GLASS', 'THEFT')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."claims_fault_determination_enum" AS ENUM('AT_FAULT', 'NOT_AT_FAULT', 'PARTIAL', 'UNDETERMINED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "claims" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "claim_number" character varying NOT NULL, "status" "public"."claims_status_enum" NOT NULL DEFAULT 'SUBMITTED', "type" "public"."claims_type_enum" NOT NULL, "fault_determination" "public"."claims_fault_determination_enum" NOT NULL DEFAULT 'UNDETERMINED', "description" text NOT NULL, "incident_date" TIMESTAMP WITH TIME ZONE NOT NULL, "reported_date" TIMESTAMP WITH TIME ZONE NOT NULL, "incident_location" character varying, "estimated_amount" numeric(12,2) NOT NULL, "approved_amount" numeric(12,2), "deductible" numeric(10,2) NOT NULL DEFAULT '0', "injury_reported" boolean NOT NULL DEFAULT false, "police_report_number" character varying, "adjuster_name" character varying, "user_id" uuid NOT NULL, "vehicle_id" uuid, "policy_id" uuid, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_96c91970c0dcb2f69fdccd0a698" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_383f456e8c7dda0114c49d47c5" ON "claims" ("claim_number") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_78214f7ed47cfd76fb8bf6bb28" ON "claims" ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6b6d7ad7d8c3982b44194fd542" ON "claims" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "first_name" character varying NOT NULL, "last_name" character varying NOT NULL, "email" character varying NOT NULL, "phone" character varying, "address_line1" character varying, "city" character varying, "state" character varying(2), "postal_code" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email") `,
    );
    await queryRunner.query(
      `ALTER TABLE "vehicles" ADD CONSTRAINT "FK_88b36924d769e4df751bcfbf249" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "policies" ADD CONSTRAINT "FK_0192750cdb713afc762287d6944" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "claim_documents" ADD CONSTRAINT "FK_9dfdd8ea365fd3699275a15b1c7" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "claim_notes" ADD CONSTRAINT "FK_370a8864b92ae4e49d9dac27d4f" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "claims" ADD CONSTRAINT "FK_6b6d7ad7d8c3982b44194fd542c" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "claims" ADD CONSTRAINT "FK_d3ee0b1b3a8349fe4c920f74372" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "claims" ADD CONSTRAINT "FK_879ff2d9bdf3ee3db7963b7a25a" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "claims" DROP CONSTRAINT "FK_879ff2d9bdf3ee3db7963b7a25a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "claims" DROP CONSTRAINT "FK_d3ee0b1b3a8349fe4c920f74372"`,
    );
    await queryRunner.query(
      `ALTER TABLE "claims" DROP CONSTRAINT "FK_6b6d7ad7d8c3982b44194fd542c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "claim_notes" DROP CONSTRAINT "FK_370a8864b92ae4e49d9dac27d4f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "claim_documents" DROP CONSTRAINT "FK_9dfdd8ea365fd3699275a15b1c7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "policies" DROP CONSTRAINT "FK_0192750cdb713afc762287d6944"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vehicles" DROP CONSTRAINT "FK_88b36924d769e4df751bcfbf249"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_6b6d7ad7d8c3982b44194fd542"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_78214f7ed47cfd76fb8bf6bb28"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_383f456e8c7dda0114c49d47c5"`);
    await queryRunner.query(`DROP TABLE "claims"`);
    await queryRunner.query(`DROP TYPE "public"."claims_fault_determination_enum"`);
    await queryRunner.query(`DROP TYPE "public"."claims_type_enum"`);
    await queryRunner.query(`DROP TYPE "public"."claims_status_enum"`);
    await queryRunner.query(`DROP TABLE "claim_notes"`);
    await queryRunner.query(`DROP TABLE "claim_documents"`);
    await queryRunner.query(`DROP TYPE "public"."claim_documents_type_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_0a3ff12ee86e399e522e8ec7ce"`);
    await queryRunner.query(`DROP TABLE "policies"`);
    await queryRunner.query(`DROP TYPE "public"."policies_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_8288ce015b69c5856cf54e07a6"`);
    await queryRunner.query(`DROP TABLE "vehicles"`);
  }
}
