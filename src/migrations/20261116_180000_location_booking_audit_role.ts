import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

/** Extend the immutable booking audit taxonomy for branch-scoped staff actions.
 * The additive PostgreSQL enum value is intentionally preserved on rollback:
 * dropping labels requires a type rebuild and risks historical audit records.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_booking_events_actor_role"
      ADD VALUE IF NOT EXISTS 'location_admin';
  `)
}
export async function down(_args: MigrateDownArgs): Promise<void> {
  // Non-destructive: historical audit events must retain their role meaning.
}
