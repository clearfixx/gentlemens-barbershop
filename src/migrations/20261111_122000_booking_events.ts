import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TYPE "public"."enum_booking_events_action" AS ENUM('confirmed','completed','cancelled','no_show');
    CREATE TYPE "public"."enum_booking_events_previous_status" AS ENUM('pending','confirmed','completed','cancelled','no_show');
    CREATE TYPE "public"."enum_booking_events_actor_role" AS ENUM('customer','assigned_barber','admin');
    CREATE TABLE "booking_events" (
      "id" serial PRIMARY KEY NOT NULL,
      "booking_id" integer NOT NULL,
      "action" "enum_booking_events_action" NOT NULL,
      "previous_status" "enum_booking_events_previous_status" NOT NULL,
      "actor_id" integer NOT NULL,
      "actor_role" "enum_booking_events_actor_role" NOT NULL,
      "reason" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    ALTER TABLE "booking_events" ADD CONSTRAINT "booking_events_booking_id_bookings_id_fk"
      FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "booking_events" ADD CONSTRAINT "booking_events_actor_id_users_id_fk"
      FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
    CREATE INDEX "booking_events_booking_idx" ON "booking_events" USING btree ("booking_id");
    CREATE INDEX "booking_events_actor_idx" ON "booking_events" USING btree ("actor_id");
    CREATE INDEX "booking_events_updated_at_idx" ON "booking_events" USING btree ("updated_at");
    CREATE INDEX "booking_events_created_at_idx" ON "booking_events" USING btree ("created_at");
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "booking_events_id" integer;
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_booking_events_fk"
      FOREIGN KEY ("booking_events_id") REFERENCES "public"."booking_events"("id") ON DELETE cascade ON UPDATE no action;
    CREATE INDEX "payload_locked_documents_rels_booking_events_id_idx"
      ON "payload_locked_documents_rels" USING btree ("booking_events_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX "payload_locked_documents_rels_booking_events_id_idx";
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_booking_events_fk";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "booking_events_id";
    DROP TABLE "booking_events" CASCADE;
    DROP TYPE "public"."enum_booking_events_action";
    DROP TYPE "public"."enum_booking_events_previous_status";
    DROP TYPE "public"."enum_booking_events_actor_role";
  `)
}
