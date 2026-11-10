import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

/**
 * Enforce booking concurrency invariants in PostgreSQL, not in availability
 * reads or application hooks. Existing invalid/overlapping rows must be
 * resolved before applying this migration.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE EXTENSION IF NOT EXISTS btree_gist;

    ALTER TABLE "bookings"
      ADD CONSTRAINT "bookings_valid_interval"
      CHECK ("ends_at" > "starts_at");

    ALTER TABLE "bookings"
      ADD CONSTRAINT "bookings_idempotency_complete"
      CHECK (
        num_nonnulls("idempotency_scope", "idempotency_key", "idempotency_request_hash") = 0
        OR (
          num_nonnulls("idempotency_scope", "idempotency_key", "idempotency_request_hash") = 3
          AND length("idempotency_scope") BETWEEN 1 AND 160
          AND length("idempotency_key") BETWEEN 1 AND 160
          AND "idempotency_request_hash" ~ '^[a-f0-9]{64}
      );

    CREATE UNIQUE INDEX "bookings_idempotency_scope_key_unique"
      ON "bookings" ("idempotency_scope", "idempotency_key")
      WHERE "idempotency_scope" IS NOT NULL;

    ALTER TABLE "bookings"
      ADD CONSTRAINT "bookings_no_active_overlap"
      EXCLUDE USING gist (
        "barber_id" WITH =,
        tstzrange("starts_at", "ends_at", '[)') WITH &&
      )
      WHERE ("status" IN ('pending', 'confirmed'));
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "bookings" DROP CONSTRAINT "bookings_no_active_overlap";
    DROP INDEX "bookings_idempotency_scope_key_unique";
    ALTER TABLE "bookings" DROP CONSTRAINT "bookings_idempotency_complete";
    ALTER TABLE "bookings" DROP CONSTRAINT "bookings_valid_interval";
    -- btree_gist is shared database infrastructure; do not drop it here.
  `)
}

        )
      );

    CREATE UNIQUE INDEX "bookings_idempotency_scope_key_unique"
      ON "bookings" ("idempotency_scope", "idempotency_key")
      WHERE "idempotency_scope" IS NOT NULL;

    ALTER TABLE "bookings"
      ADD CONSTRAINT "bookings_no_active_overlap"
      EXCLUDE USING gist (
        "barber_id" WITH =,
        tstzrange("starts_at", "ends_at", '[)') WITH &&
      )
      WHERE ("status" IN ('pending', 'confirmed'));
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "bookings" DROP CONSTRAINT "bookings_no_active_overlap";
    DROP INDEX "bookings_idempotency_scope_key_unique";
    ALTER TABLE "bookings" DROP CONSTRAINT "bookings_idempotency_complete";
    ALTER TABLE "bookings" DROP CONSTRAINT "bookings_valid_interval";
    -- btree_gist is shared database infrastructure; do not drop it here.
  `)
}
