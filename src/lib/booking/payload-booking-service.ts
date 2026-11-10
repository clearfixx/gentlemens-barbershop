import type { Payload } from 'payload'
import { assertBookingIdempotencyIdentity, prepareBookingIdempotency } from './idempotency.ts'
import { findExistingPayloadBooking, persistIdempotentPayloadBooking } from './payload-idempotency.ts'
import { createBooking } from './create-booking.ts'
import { snapshotBookingRequest, type BookingQuote, type BookingRequest } from './booking-request.ts'
import { getBarberAvailability } from './get-barber-availability.ts'
import { localDayMinute } from './local-time.ts'
import { loadBookingCatalog } from './load-booking-catalog.ts'
import { persistPayloadBooking } from './persist-payload-booking.ts'

async function loadPayloadAvailableSlots(payload: Payload, quote: BookingQuote) {
  const location = await payload.findByID({
    collection: 'locations', id: quote.locationId, depth: 0, overrideAccess: true,
  })
  if (!location.isActive || !location.timeZone) throw new RangeError('Booking location is unavailable')
  const date = localDayMinute(new Date(quote.startsAt), location.timeZone).date
  return getBarberAvailability({ payload, barberId: quote.barberId, date, durationMinutes: quote.durationMinutes })
}

/**
 * Internal trusted booking boundary. No route is exposed.
 * The caller must validate authentication and rate limits before invoking it.
 * The database exclusion constraint must be installed before any writes.
 */
export async function createPayloadBooking(payload: Payload, request: BookingRequest) {
  return createBooking({
    request,
    loadCatalog: input => loadBookingCatalog(payload, input),
    loadAvailableSlots: quote => loadPayloadAvailableSlots(payload, quote),
    persist: quote => persistPayloadBooking(payload, quote),
  })
}

/**
 * An authenticated caller must derive scope from its verified identity, never
 * from a client-controlled field. The idempotency key is a client retry token.
 * Replay is checked before availability because the original booking occupies
 * its own slot. Concurrent inserts remain protected by PostgreSQL constraints.
 */
export async function createIdempotentPayloadBooking(
  payload: Payload,
  request: BookingRequest,
  identityScope: string,
  key: string,
) {
  const snapshot = snapshotBookingRequest(request)
  const token = prepareBookingIdempotency({ scope: identityScope, key, request: snapshot })
  const existing = await findExistingPayloadBooking(payload, token)
  if (existing) {
    assertBookingIdempotencyIdentity(token, existing)
    return { booking: existing.booking, replayed: true }
  }
  try {
    return await createBooking({
      request: snapshot,
      loadCatalog: input => loadBookingCatalog(payload, input),
      loadAvailableSlots: quote => loadPayloadAvailableSlots(payload, quote),
      persist: quote => persistIdempotentPayloadBooking(payload, quote, token),
    })
  } catch (error) {
    // A concurrent identical request can win while this request is checking
    // availability. Only a verified same-key/same-hash winner may be replayed.
    if (error instanceof RangeError && error.message === 'Selected booking slot is unavailable') {
      const winner = await findExistingPayloadBooking(payload, token)
      if (winner) {
        assertBookingIdempotencyIdentity(token, winner)
        return { booking: winner.booking, replayed: true }
      }
    }
    throw error
  }
}
