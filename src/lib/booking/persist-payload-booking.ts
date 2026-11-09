import type { Payload } from 'payload'
import type { BookingQuote } from './booking-request.ts'
import type { BookingIdempotency } from './idempotency.ts'
import { throwBookingConflictIfApplicable } from './booking-errors.ts'

/**
 * Trusted server-side persistence adapter. Call only after the catalog and
 * available slot have been validated by createBooking().
 *
 * PostgreSQL's bookings_no_active_overlap exclusion constraint MUST be
 * installed in the target database. No read-before-write conflict check can
 * replace that constraint.
 *
 * Never expose this function directly to an untrusted HTTP request.
 */
export async function persistPayloadBooking(
  payload: Payload,
  quote: BookingQuote,
  idempotency?: BookingIdempotency,
  options: { deferConflictTranslation?: boolean } = {},
) {
  try {
    return await payload.create({
      collection: 'bookings',
      overrideAccess: true,
      depth: 0,
      data: {
        location: quote.locationId,
        barber: quote.barberId,
        services: quote.serviceIds,
        customerName: quote.customerName,
        customerPhone: quote.customerPhone,
        ...(quote.customerEmail ? { customerEmail: quote.customerEmail } : {}),
        startsAt: quote.startsAt,
        endsAt: quote.endsAt,
        totalPrice: quote.totalPrice,
        status: 'pending',
        ...(idempotency ? {
          idempotencyScope: idempotency.scope,
          idempotencyKey: idempotency.key,
          idempotencyRequestHash: idempotency.requestHash,
        } : {}),
      },
    })
  } catch (error) {
    if (options.deferConflictTranslation) throw error
    return throwBookingConflictIfApplicable(error)
  }
}
