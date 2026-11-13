import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

/**
 * Guest ownership proof requires an email challenge. Audit must distinguish
 * verified guest actions from customer/admin actions without inventing users.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    -- Payload push-mode disposable CI databases may already expose guest
    -- in the enum. Only the versioned migration changes production schemas.
    DO $guest_role$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'enum_booking_events_actor_role' AND e.enumlabel = 'guest'
      ) THEN
        CREATE TYPE "public"."enum_booking_events_actor_role_guest"
          AS ENUM('customer', 'assigned_barber', 'admin', 'guest');
        ALTER TABLE "booking_events"
          ALTER COLUMN "actor_role" TYPE "enum_booking_events_actor_role_guest"
            USING "actor_role"::text::"enum_booking_events_actor_role_guest";
        DROP TYPE "public"."enum_booking_events_actor_role";
        ALTER TYPE "public"."enum_booking_events_actor_role_guest"
          RENAME TO "enum_booking_events_actor_role";
      END IF;
    END $guest_role$;
    ALTER TABLE "booking_events" ALTER COLUMN "actor_id" DROP NOT NULL;

    CREATE TABLE IF NOT EXISTS "booking_guest_cancellation_challenges" (
      "booking_id" integer PRIMARY KEY NOT NULL
        REFERENCES "public"."bookings"("id") ON DELETE CASCADE,
      "code_hash" varchar(64) NOT NULL,
      "issued_at" timestamp(3) with time zone NOT NULL,
      "expires_at" timestamp(3) with time zone NOT NULL,
      "attempts" integer NOT NULL DEFAULT 0 CHECK ("attempts" BETWEEN 0 AND 5),
      "consumed_at" timestamp(3) with time zone,
      CONSTRAINT "guest_cancel_challenge_interval" CHECK ("expires_at" > "issued_at")
    );
    CREATE INDEX IF NOT EXISTS "guest_cancel_challenges_expiry_idx"
      ON "booking_guest_cancellation_challenges" ("expires_at");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Never silently erase existing guest audit events on rollback.
  const guestEvents = await db.execute(sql`
    SELECT count(*)::int AS count FROM booking_events WHERE actor_role = 'guest'
  `)
  if (Number(guestEvents.rows[0]?.count) !== 0) {
    throw new Error('Cannot downgrade: guest cancellation audit events exist')
  }
  await db.execute(sql`
    DROP TABLE "booking_guest_cancellation_challenges";
    CREATE TYPE "public"."enum_booking_events_actor_role_old"
      AS ENUM('customer', 'assigned_barber', 'admin');
    ALTER TABLE "booking_events"
      ALTER COLUMN "actor_role" TYPE "enum_booking_events_actor_role_old"
        USING "actor_role"::text::"enum_booking_events_actor_role_old";
    DROP TYPE "public"."enum_booking_events_actor_role";
    ALTER TYPE "public"."enum_booking_events_actor_role_old"
      RENAME TO "enum_booking_events_actor_role";
    ALTER TABLE "booking_events" ALTER COLUMN "actor_id" SET NOT NULL;
  `)
}
