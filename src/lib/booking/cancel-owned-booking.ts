import type { Payload } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import { bookingIdentityScope, type BookingActor } from './booking-identity.ts'

export class BookingCancellationConflictError extends Error {
  constructor() {
    super('Booking cannot be cancelled')
    this.name = 'BookingCancellationConflictError'
  }
}

/** Never accept owner identity or status from the request body. */
export function parseCancellationIdentity(
  bookingId: string,
  actor: BookingActor | null,
): { bookingId: number; customerId: number } {
  bookingIdentityScope(actor)
  if (!/^[1-9][0-9]*$/.test(bookingId)) throw new RangeError('Invalid booking identifier')
  const id = Number(bookingId)
  if (!Number.isSafeInteger(id)) throw new RangeError('Invalid booking identifier')
  return { bookingId: id, customerId: actor!.id }
}

/**
 * One atomic conditional UPDATE. Never read the row then issue a separate
 * Payload update: that would race completion, cancellation or ownership changes.
 * No untrusted caller can cancel a booking belonging to someone else.
 */
export async function cancelOwnedBooking(
  payload: Pick<Payload, 'db'>,
  bookingId: string,
  actor: BookingActor | null,
): Promise<{ id: number; status: 'cancelled' }> {
  const identity = parseCancellationIdentity(bookingId, actor)
  const result = await payload.db.drizzle.execute(sql`
    WITH eligible AS MATERIALIZED (
      SELECT booking.id, booking.status
      FROM bookings AS booking
      JOIN locations AS location ON location.id = booking.location_id
      WHERE booking.id = ${identity.bookingId}
        AND booking.customer_id = ${identity.customerId}
        AND booking.status IN ('pending', 'confirmed')
        AND booking.starts_at > NOW() +
          (location.cancellation_deadline_minutes * INTERVAL '1 minute')
      FOR UPDATE OF booking
    ),
    changed AS (
      UPDATE bookings AS booking
      SET status = 'cancelled', updated_at = NOW()
      FROM eligible
      WHERE booking.id = eligible.id AND booking.status = eligible.status
      RETURNING booking.id, eligible.status AS previous_status
    ),
    recorded AS (
      INSERT INTO booking_events
        (booking_id, action, previous_status, actor_id, actor_role, updated_at, created_at)
      SELECT id, 'cancelled'::public.enum_booking_events_action,
              previous_status::text::public.enum_booking_events_previous_status,
              ${identity.customerId}, 'customer'::public.enum_booking_events_actor_role, NOW(), NOW()
      FROM changed
      RETURNING booking_id
    )
    SELECT changed.id
    FROM changed JOIN recorded ON recorded.booking_id = changed.id
  `)
  if (!Array.isArray(result.rows) || result.rows.length > 1) {
    throw new Error('Unexpected booking cancellation response')
  }
  if (result.rows.length === 0) throw new BookingCancellationConflictError()
  const id = Number(result.rows[0]?.id)
  if (id !== identity.bookingId) throw new Error('Unexpected booking cancellation identity')
  return { id, status: 'cancelled' }
}
