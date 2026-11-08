import type { Payload } from 'payload'
import { createBooking } from './create-booking.ts'
import type { BookingRequest } from './booking-request.ts'
import { getBarberAvailability } from './get-barber-availability.ts'
import { loadBookingCatalog } from './load-booking-catalog.ts'
import { persistPayloadBooking } from './persist-payload-booking.ts'

/**
 * Internal trusted booking boundary. No route is exposed.
 * The caller must validate authentication and rate limits before invoking it.
 * The database exclusion constraint must be installed before any writes.
 */
export async function createPayloadBooking(payload: Payload, request: BookingRequest) {
  return createBooking({
    request,
    loadCatalog: input => loadBookingCatalog(payload, input),
    loadAvailableSlots: quote => getBarberAvailability({
      payload,
      barberId: quote.barberId,
      date: quote.startsAt.slice(0, 10),
      durationMinutes: quote.durationMinutes,
    }),
    persist: quote => persistPayloadBooking(payload, quote),
  })
}
