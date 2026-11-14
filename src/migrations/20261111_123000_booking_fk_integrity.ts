import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

/**
 * Preserve booking history and prevent deleting a location or barber
 * referenced by a booking. The original columns are NOT NULL.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "bookings" DROP CONSTRAINT "bookings_location_id_locations_id_fk";
    ALTER TABLE "bookings" ADD CONSTRAINT "bookings_location_id_locations_id_fk"
      FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION;

    ALTER TABLE "bookings" DROP CONSTRAINT "bookings_barber_id_barbers_id_fk";
    ALTER TABLE "bookings" ADD CONSTRAINT "bookings_barber_id_barbers_id_fk"
      FOREIGN KEY ("barber_id") REFERENCES "public"."barbers"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION;

    ALTER TABLE "barbers" DROP CONSTRAINT "barbers_location_id_locations_id_fk";
    ALTER TABLE "barbers" ADD CONSTRAINT "barbers_location_id_locations_id_fk"
      FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "barbers" DROP CONSTRAINT "barbers_location_id_locations_id_fk";
    ALTER TABLE "barbers" ADD CONSTRAINT "barbers_location_id_locations_id_fk"
      FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;

    ALTER TABLE "bookings" DROP CONSTRAINT "bookings_barber_id_barbers_id_fk";
    ALTER TABLE "bookings" ADD CONSTRAINT "bookings_barber_id_barbers_id_fk"
      FOREIGN KEY ("barber_id") REFERENCES "public"."barbers"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;

    ALTER TABLE "bookings" DROP CONSTRAINT "bookings_location_id_locations_id_fk";
    ALTER TABLE "bookings" ADD CONSTRAINT "bookings_location_id_locations_id_fk"
      FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  `)
}
