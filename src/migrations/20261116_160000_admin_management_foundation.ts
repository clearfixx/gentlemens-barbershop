import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

/** Network/location administration foundation.
 * Rollback intentionally refuses to silently drop location-admin accounts.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_users_role" ADD VALUE IF NOT EXISTS 'location_admin';
  `)
  await db.execute(sql`
    CREATE TYPE "public"."enum_commercial_change_requests_kind" AS ENUM (
      'service_price', 'service_duration', 'barber_price', 'barber_duration', 'service_assignment'
    );
    CREATE TYPE "public"."enum_commercial_change_requests_status" AS ENUM (
      'pending', 'approved', 'rejected'
    );

    CREATE TABLE "location_assignments" (
      "id" serial PRIMARY KEY NOT NULL,
      "user_id" integer NOT NULL,
      "location_id" integer NOT NULL,
      "is_active" boolean DEFAULT true NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE "commercial_change_requests" (
      "id" serial PRIMARY KEY NOT NULL,
      "location_id" integer NOT NULL,
      "created_by_id" integer NOT NULL,
      "kind" "enum_commercial_change_requests_kind" NOT NULL,
      "service_id" integer NOT NULL,
      "barber_id" integer,
      "old_value" jsonb NOT NULL,
      "proposed_value" jsonb NOT NULL,
      "expected_revision" varchar NOT NULL,
      "status" "enum_commercial_change_requests_status" DEFAULT 'pending' NOT NULL,
      "decided_by_id" integer,
      "decided_at" timestamp(3) with time zone,
      "decision_reason" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    ALTER TABLE "location_assignments" ADD CONSTRAINT "location_assignments_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
    ALTER TABLE "location_assignments" ADD CONSTRAINT "location_assignments_location_id_locations_id_fk"
      FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;
    CREATE UNIQUE INDEX "location_assignments_user_location_unique"
      ON "location_assignments" USING btree ("user_id", "location_id");
    CREATE INDEX "location_assignments_user_idx" ON "location_assignments" USING btree ("user_id");
    CREATE INDEX "location_assignments_location_idx" ON "location_assignments" USING btree ("location_id");
    CREATE INDEX "location_assignments_updated_at_idx" ON "location_assignments" USING btree ("updated_at");
    CREATE INDEX "location_assignments_created_at_idx" ON "location_assignments" USING btree ("created_at");

    ALTER TABLE "commercial_change_requests" ADD CONSTRAINT "commercial_change_requests_location_id_locations_id_fk"
      FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;
    ALTER TABLE "commercial_change_requests" ADD CONSTRAINT "commercial_change_requests_created_by_id_users_id_fk"
      FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
    ALTER TABLE "commercial_change_requests" ADD CONSTRAINT "commercial_change_requests_service_id_services_id_fk"
      FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE restrict ON UPDATE no action;
    ALTER TABLE "commercial_change_requests" ADD CONSTRAINT "commercial_change_requests_barber_id_barbers_id_fk"
      FOREIGN KEY ("barber_id") REFERENCES "public"."barbers"("id") ON DELETE restrict ON UPDATE no action;
    ALTER TABLE "commercial_change_requests" ADD CONSTRAINT "commercial_change_requests_decided_by_id_users_id_fk"
      FOREIGN KEY ("decided_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;

    CREATE INDEX "commercial_change_requests_location_idx" ON "commercial_change_requests" USING btree ("location_id");
    CREATE INDEX "commercial_change_requests_created_by_idx" ON "commercial_change_requests" USING btree ("created_by_id");
    CREATE INDEX "commercial_change_requests_service_idx" ON "commercial_change_requests" USING btree ("service_id");
    CREATE INDEX "commercial_change_requests_barber_idx" ON "commercial_change_requests" USING btree ("barber_id");
    CREATE INDEX "commercial_change_requests_decided_by_idx" ON "commercial_change_requests" USING btree ("decided_by_id");
    CREATE INDEX "commercial_change_requests_status_idx" ON "commercial_change_requests" USING btree ("status");
    CREATE INDEX "commercial_change_requests_updated_at_idx" ON "commercial_change_requests" USING btree ("updated_at");
    CREATE INDEX "commercial_change_requests_created_at_idx" ON "commercial_change_requests" USING btree ("created_at");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "location_assignments_id" integer;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "commercial_change_requests_id" integer;
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_location_assignments_fk"
      FOREIGN KEY ("location_assignments_id") REFERENCES "public"."location_assignments"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_commercial_change_requests_fk"
      FOREIGN KEY ("commercial_change_requests_id") REFERENCES "public"."commercial_change_requests"("id") ON DELETE cascade ON UPDATE no action;
    CREATE INDEX "payload_locked_documents_rels_location_assignments_id_idx"
      ON "payload_locked_documents_rels" USING btree ("location_assignments_id");
    CREATE INDEX "payload_locked_documents_rels_commercial_change_requests_id_idx"
      ON "payload_locked_documents_rels" USING btree ("commercial_change_requests_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM "users" WHERE "role"::text = 'location_admin') THEN
        RAISE EXCEPTION 'Cannot roll back: location administrators still exist';
      END IF;
      IF EXISTS (SELECT 1 FROM "commercial_change_requests")
         OR EXISTS (SELECT 1 FROM "location_assignments") THEN
        RAISE EXCEPTION 'Cannot roll back: administrative assignments or requests still exist';
      END IF;
    END $$;

    DROP INDEX "payload_locked_documents_rels_commercial_change_requests_id_idx";
    DROP INDEX "payload_locked_documents_rels_location_assignments_id_idx";
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_commercial_change_requests_fk";
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_location_assignments_fk";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "commercial_change_requests_id";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "location_assignments_id";
    DROP TABLE "commercial_change_requests";
    DROP TABLE "location_assignments";
    DROP TYPE "public"."enum_commercial_change_requests_status";
    DROP TYPE "public"."enum_commercial_change_requests_kind";
    -- The added enum_users_role value is retained: PostgreSQL does not support
    -- dropping individual enum labels without rebuilding the type.
  `)
}
