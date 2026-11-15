import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

/** Add an optional media reference, preserving all existing accounts. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "users" ADD COLUMN "avatar_id" integer;
    ALTER TABLE "users" ADD CONSTRAINT "users_avatar_id_media_id_fk"
      FOREIGN KEY ("avatar_id") REFERENCES "public"."media"("id")
      ON DELETE set null ON UPDATE no action;
    CREATE INDEX "users_avatar_idx" ON "users" USING btree ("avatar_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "users_avatar_idx";
    ALTER TABLE "users" DROP CONSTRAINT "users_avatar_id_media_id_fk";
    ALTER TABLE "users" DROP COLUMN "avatar_id";
  `)
}
