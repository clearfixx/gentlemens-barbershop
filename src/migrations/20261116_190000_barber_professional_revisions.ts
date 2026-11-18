import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

/** Stores private barber professional content snapshots, not live published data.
 * No automated publication in this migration. Existing barbers are untouched.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TYPE "public"."enum_barber_profile_revisions_status" AS ENUM (
      'draft', 'pending', 'approved', 'rejected'
    );

    CREATE TABLE "barber_profile_revisions" (
      "id" serial PRIMARY KEY NOT NULL,
      "barber_id" integer NOT NULL,
      "location_id" integer NOT NULL,
      "author_id" integer NOT NULL,
      "base_revision" varchar NOT NULL,
      "snapshot" jsonb NOT NULL,
      "changes" jsonb NOT NULL,
      "status" "enum_barber_profile_revisions_status" DEFAULT 'draft' NOT NULL,
      "reviewer_id" integer,
      "reviewed_at" timestamp(3) with time zone,
      "rejection_reason" varchar,
      "applied_revision" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    ALTER TABLE "barber_profile_revisions"
      ADD CONSTRAINT "barber_profile_revisions_barber_fk"
        FOREIGN KEY ("barber_id") REFERENCES "public"."barbers"("id") ON DELETE restrict ON UPDATE no action;
    ALTER TABLE "barber_profile_revisions"
      ADD CONSTRAINT "barber_profile_revisions_location_fk"
        FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;
    ALTER TABLE "barber_profile_revisions"
      ADD CONSTRAINT "barber_profile_revisions_author_fk"
        FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
    ALTER TABLE "barber_profile_revisions"
      ADD CONSTRAINT "barber_profile_revisions_reviewer_fk"
        FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
    CREATE INDEX "barber_profile_revisions_barber_idx" ON "barber_profile_revisions" USING btree ("barber_id");
    CREATE INDEX "barber_profile_revisions_location_idx" ON "barber_profile_revisions" USING btree ("location_id");
    CREATE INDEX "barber_profile_revisions_author_idx" ON "barber_profile_revisions" USING btree ("author_id");
    CREATE INDEX "barber_profile_revisions_reviewer_idx" ON "barber_profile_revisions" USING btree ("reviewer_id");
    CREATE INDEX "barber_profile_revisions_status_idx" ON "barber_profile_revisions" USING btree ("status");
    CREATE INDEX "barber_profile_revisions_updated_at_idx" ON "barber_profile_revisions" USING btree ("updated_at");
    CREATE INDEX "barber_profile_revisions_created_at_idx" ON "barber_profile_revisions" USING btree ("created_at");

    ALTER TABLE "payload_locked_documents_rels"
      ADD COLUMN "barber_profile_revisions_id" integer;
    ALTER TABLE "payload_locked_documents_rels"
      ADD CONSTRAINT "payload_locked_documents_rels_barber_profile_revisions_fk"
        FOREIGN KEY ("barber_profile_revisions_id")
        REFERENCES "public"."barber_profile_revisions"("id") ON DELETE cascade ON UPDATE no action;
    CREATE INDEX "payload_locked_documents_rels_barber_profile_revisions_id_idx"
      ON "payload_locked_documents_rels" USING btree ("barber_profile_revisions_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM "barber_profile_revisions") THEN
        RAISE EXCEPTION 'Cannot roll back professional revision schema with retained drafts or review history';
      END IF;
    END $$;
    DROP INDEX "payload_locked_documents_rels_barber_profile_revisions_id_idx";
    ALTER TABLE "payload_locked_documents_rels"
      DROP CONSTRAINT "payload_locked_documents_rels_barber_profile_revisions_fk";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "barber_profile_revisions_id";
    DROP TABLE "barber_profile_revisions";
    DROP TYPE "public"."enum_barber_profile_revisions_status";
  `)
}
