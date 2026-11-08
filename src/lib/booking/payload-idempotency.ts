import type { Payload } from 'payload'
import type { BookingQuote } from './booking-request.ts'
import type { BookingIdempotency } from './idempotency.ts'
import { throwBookingConflictIfApplicable } from './booking-errors.ts'
import { replayOrCreateBooking } from './idempotent-replay.ts'
import { persistPayloadBooking } from './persist-payload-booking.ts'

/**
 * Trusted server-only adapter. The PostgreSQL unique index is mandatory:
 * a read-before-insert check alone is not concurrency-safe.
 *
 * The booking quote must already have been derived and its slot validated.
 * The caller must authenticate the scope and validate the request fingerprint.
 */
export async function persistIdempotentPayloadBooking(
  payload: Payload,
  quote: BookingQuote,
  token: BookingIdempotency,
) {
  try {
    return await replayOrCreateBooking({
    token,
    findExisting: async ({ scope, key }) => {
      const result = await payload.find({
        collection: 'bookings',
        overrideAccess: true,
        depth: 0,
        limit: 1,
        where: {
          and: [
            { idempotencyScope: { equals: scope } },
            { idempotencyKey: { equals: key } },
          ],
        },
      })
      const existing = result.docs[0]
      if (!existing) return null
      return {
        booking: existing,
        idempotency_request_hash: existing.idempotencyRequestHash ?? null,
      }
    },
    insert: async () => persistPayloadBooking(payload, quote, token, { deferConflictTranslation: true }),
  })
  } catch (error) {
    return throwBookingConflictIfApplicable(error)
  }
}
