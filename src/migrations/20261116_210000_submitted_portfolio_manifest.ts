import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

/** Immutable-intent integrity evidence for the exact private photo set
 * submitted for review. Never grants publication rights by itself.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "barber_profile_revisions"
      ADD COLUMN "submitted_manifest_hash" varchar(64);
    ALTER TABLE "barber_profile_revisions"
      ADD CONSTRAINT "professional_submitted_manifest_sha"
        CHECK (submitted_manifest_hash IS NULL OR
          submitted_manifest_hash ~ '^[0-9a-f]{64}$');
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM barber_profile_revisions
        WHERE submitted_manifest_hash IS NOT NULL
      ) THEN
        RAISE EXCEPTION 'Cannot discard submitted private portfolio manifest history';
      END IF;
    END $$;
    ALTER TABLE "barber_profile_revisions"
      DROP CONSTRAINT "professional_submitted_manifest_sha";
    ALTER TABLE "barber_profile_revisions"
      DROP COLUMN "submitted_manifest_hash";
  `)
}
