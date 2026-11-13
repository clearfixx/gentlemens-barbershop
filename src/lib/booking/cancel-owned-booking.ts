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
    UPDATE bookings
    SET status = 'cancelled', updated_at = NOW()
    WHERE id = ${identity.bookingId}
      AND customer_id = ${identity.customerId}
      AND status IN ('pending', 'confirmed')
      AND starts_at > NOW()
    RETURNING id
  `)
  if (!Array.isArray(result.rows) || result.rows.length > 1) {
    throw new Error('Unexpected booking cancellation response')
  }
  if (result.rows.length === 0) throw new BookingCancellationConflictError()
  const id = Number(result.rows[0]?.id)
  if (id !== identity.bookingId) throw new Error('Unexpected booking cancellation identity')
  return { id, status: 'cancelled' }
}
