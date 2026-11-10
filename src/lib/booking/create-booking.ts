import { assertBookingSlotAvailable } from './booking-slot.ts'
import { prepareBookingRequest, snapshotBookingRequest, type BookingQuote, type BookingRequest } from './booking-request.ts'
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
  const request = snapshotBookingRequest(input.request)
  // The public availability feed hides elapsed slots; the trusted write path
  // must independently reject them, including callers that bypass the UI.
  if (Date.parse(request.startsAt) <= Date.now()) {
    throw new RangeError('Booking start must be in the future')
  }
  const catalog = await input.loadCatalog({ ...request, serviceIds: [...request.serviceIds] })
  const quote = prepareBookingRequest({ request, ...catalog })
  // The availability adapter may inspect the quote but must not mutate the
  // authoritative values subsequently checked and persisted.
  const slots = await input.loadAvailableSlots({ ...quote, serviceIds: [...quote.serviceIds] })
  assertBookingSlotAvailable(quote, slots)
  // Availability I/O can take time. Never insert a slot that elapsed while
  // the request was waiting for the catalog or schedule lookup.
  if (Date.parse(quote.startsAt) <= Date.now()) {
    throw new RangeError('Booking start must be in the future')
  }

  // Availability is advisory: another transaction may reserve the slot
  // between this check and insertion. The database constraint is authoritative.
  try {
    return await input.persist(quote)
  } catch (error) {
    return throwBookingConflictIfApplicable(error)
  }
}
