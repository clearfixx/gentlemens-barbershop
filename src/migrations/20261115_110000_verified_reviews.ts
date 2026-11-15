import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

/** UNIQUE booking index provides at-most-one review even for racing requests. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TYPE "public"."enum_reviews_status" AS ENUM ('pending', 'published', 'rejected');
    CREATE TABLE "reviews" (
      "id" serial PRIMARY KEY NOT NULL,
      "booking_id" integer NOT NULL,
      "customer_id" integer NOT NULL,
      "barber_id" integer NOT NULL,
      "rating" numeric NOT NULL,
      "comment" varchar NOT NULL,
      "status" "enum_reviews_status" DEFAULT 'pending' NOT NULL,
      "published_at" timestamp(3) with time zone,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    ALTER TABLE "reviews" ADD CONSTRAINT "reviews_booking_id_bookings_id_fk"
      FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;
    ALTER TABLE "reviews" ADD CONSTRAINT "reviews_customer_id_users_id_fk"
      FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
    ALTER TABLE "reviews" ADD CONSTRAINT "reviews_barber_id_barbers_id_fk"
      FOREIGN KEY ("barber_id") REFERENCES "public"."barbers"("id") ON DELETE restrict ON UPDATE no action;
    CREATE UNIQUE INDEX "reviews_booking_idx" ON "reviews" USING btree ("booking_id");
    CREATE INDEX "reviews_customer_idx" ON "reviews" USING btree ("customer_id");
    CREATE INDEX "reviews_barber_idx" ON "reviews" USING btree ("barber_id");
    CREATE INDEX "reviews_updated_at_idx" ON "reviews" USING btree ("updated_at");
    CREATE INDEX "reviews_created_at_idx" ON "reviews" USING btree ("created_at");
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "reviews_id" integer;
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_reviews_fk"
      FOREIGN KEY ("reviews_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;
    CREATE INDEX "payload_locked_documents_rels_reviews_id_idx"
      ON "payload_locked_documents_rels" USING btree ("reviews_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX "payload_locked_documents_rels_reviews_id_idx";
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_reviews_fk";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "reviews_id";
    DROP TABLE "reviews";
    DROP TYPE "public"."enum_reviews_status";
  `)
}
