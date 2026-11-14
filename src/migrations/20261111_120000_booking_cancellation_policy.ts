import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "locations"
      ADD COLUMN "cancellation_deadline_minutes" integer DEFAULT 60 NOT NULL;
    ALTER TABLE "locations"
      ADD CONSTRAINT "locations_cancellation_deadline_minutes_range"
      CHECK ("cancellation_deadline_minutes" BETWEEN 0 AND 10080);
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "locations"
      DROP CONSTRAINT "locations_cancellation_deadline_minutes_range";
    ALTER TABLE "locations"
      DROP COLUMN "cancellation_deadline_minutes";
  `)
}
