import type { Payload } from 'payload'
import { createBooking } from './create-booking.ts'
import type { BookingRequest } from './booking-request.ts'
import { getBarberAvailability } from './get-barber-availability.ts'
import { localDayMinute } from './local-time.ts'
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
    loadAvailableSlots: async quote => {
      const location = await payload.findByID({
        collection: 'locations', id: quote.locationId, depth: 0, overrideAccess: true,
      })
      if (!location.isActive || !location.timeZone) {
        throw new RangeError('Booking location is unavailable')
      }
      const date = localDayMinute(new Date(quote.startsAt), location.timeZone).date
      return getBarberAvailability({
        payload, barberId: quote.barberId, date,
        durationMinutes: quote.durationMinutes,
      })
    },
    persist: quote => persistPayloadBooking(payload, quote),
  })
}
