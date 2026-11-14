import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "barbers" ADD COLUMN "user_id" integer;
    ALTER TABLE "barbers"
      ADD CONSTRAINT "barbers_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
      ON DELETE set null ON UPDATE no action;
    CREATE UNIQUE INDEX "barbers_user_idx" ON "barbers" USING btree ("user_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX "barbers_user_idx";
    ALTER TABLE "barbers" DROP CONSTRAINT "barbers_user_id_users_id_fk";
    ALTER TABLE "barbers" DROP COLUMN "user_id";
  `)
}
