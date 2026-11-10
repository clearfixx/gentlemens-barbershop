import type { Payload } from 'payload'
import type { BookingQuote } from './booking-request.ts'
import { BookingIdempotencyConflictError, prepareBookingIdempotency, type BookingIdempotency } from './idempotency.ts'
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
  // Do not let a caller attach a valid-looking retry key to a different quote.
  // This is an internal consistency check; the scope still must come from
  // authenticated server context, never from the request body.
  const expected = prepareBookingIdempotency({
    scope: token.scope,
    key: token.key,
    request: quote,
  })
  if (token.requestHash !== expected.requestHash) {
    throw new BookingIdempotencyConflictError()
  }
  try {
    return await replayOrCreateBooking({
      token,
      findExisting: key => findExistingPayloadBooking(payload, key),
      insert: async () => persistPayloadBooking(payload, quote, token, { deferConflictTranslation: true }),
    })
  } catch (error) {
    return throwBookingConflictIfApplicable(error)
  }
}

/** Exact-key lookup for replay before checking availability. */
export async function findExistingPayloadBooking(payload: Payload, token: BookingIdempotency) {
  const { scope, key } = token
  const result = await payload.find({
    collection: 'bookings', overrideAccess: true, depth: 0, limit: 2,
    where: { and: [
      { idempotencyScope: { equals: scope } },
      { idempotencyKey: { equals: key } },
    ] },
  })
  // A unique index should make this impossible. Fail closed if the index is
  // missing or the database has already become inconsistent.
  if (result.docs.length > 1) throw new BookingIdempotencyConflictError()
  const existing = result.docs[0]
  if (!existing) return null
  return {
    booking: existing,
    idempotency_scope: existing.idempotencyScope ?? null,
    idempotency_key: existing.idempotencyKey ?? null,
    idempotency_request_hash: existing.idempotencyRequestHash ?? null,
  }
}
