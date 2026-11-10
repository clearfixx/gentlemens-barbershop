import { assertBookingSlotAvailable } from './booking-slot.ts'
import { prepareBookingRequest, validateBookingRequestShape, type BookingQuote, type BookingRequest } from './booking-request.ts'
import { throwBookingConflictIfApplicable } from './booking-errors.ts'
import type { BarberOffering, ServiceSnapshot } from './resolve-offering.ts'
import type { ZonedSlot } from './zoned-availability.ts'

export type BookingCatalog = {
  barber: { id: number; locationId: number; isActive: boolean; offerings: BarberOffering[] }
  location: { id: number; isActive: boolean }
  services: ServiceSnapshot[]
}

/**
 * Internal orchestration boundary. The caller must supply trusted catalog
 * lookups, availability queries and a persistence implementation backed by
 * the PostgreSQL exclusion constraint. No public endpoint is exposed here.
 */
export async function createBooking<T>(input: {
  request: BookingRequest
  loadCatalog: (request: BookingRequest) => Promise<BookingCatalog>
  loadAvailableSlots: (quote: BookingQuote) => Promise<ZonedSlot[]>
  persist: (quote: BookingQuote) => Promise<T>
}): Promise<T> {
  validateBookingRequestShape(input.request)
  const catalog = await input.loadCatalog(input.request)
  const quote = prepareBookingRequest({ request: input.request, ...catalog })
  const slots = await input.loadAvailableSlots(quote)
  assertBookingSlotAvailable(quote, slots)

  // Availability is advisory: another transaction may reserve the slot
  // between this check and insertion. The database constraint is authoritative.
  try {
    return await input.persist(quote)
  } catch (error) {
    return throwBookingConflictIfApplicable(error)
  }
}
