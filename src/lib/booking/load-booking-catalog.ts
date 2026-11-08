import type { Payload } from 'payload'
import type { BookingCatalog } from './create-booking.ts'
import type { BookingRequest } from './booking-request.ts'
import type { BarberOffering } from './resolve-offering.ts'

function numericId(value: unknown): number {
  const id = typeof value === 'object' && value !== null && 'id' in value
    ? (value as { id: unknown }).id : value
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) {
    throw new RangeError('Invalid catalog relationship ID')
  }
  return id
}

type OfferingRow = { service: unknown; priceOverride?: number | null; durationOverrideMinutes?: number | null }
type CatalogBarber = { serviceOfferings?: OfferingRow[] | null }
type CatalogService = { price: number; durationMinutes: number }


/**
 * Trusted server-side catalog lookup. Never accept pricing, duration,
 * location ownership or offering lists from the booking client.
 */
export async function loadBookingCatalog(
  payload: Payload,
  request: BookingRequest,
): Promise<BookingCatalog> {
  if (!Number.isSafeInteger(request.barberId) || request.barberId <= 0 ||
      !Number.isSafeInteger(request.locationId) || request.locationId <= 0 ||
      !Array.isArray(request.serviceIds) || request.serviceIds.length < 1 ||
      request.serviceIds.length > 10 ||
      !request.serviceIds.every(id => Number.isSafeInteger(id) && id > 0) ||
      new Set(request.serviceIds).size !== request.serviceIds.length) {
    throw new RangeError('Invalid booking catalog selection')
  }

  const [barber, location, services] = await Promise.all([
    payload.findByID({ collection: 'barbers', id: request.barberId, depth: 0, overrideAccess: true }),
    payload.findByID({ collection: 'locations', id: request.locationId, depth: 0, overrideAccess: true }),
    Promise.all(request.serviceIds.map(id =>
      payload.findByID({ collection: 'services', id, depth: 0, overrideAccess: true }),
    )),
  ])
  const barberLocationId = numericId(barber.location)
  return {
    barber: {
      id: numericId(barber.id),
      locationId: barberLocationId,
      isActive: Boolean(barber.isActive),
      offerings: ((barber as unknown as CatalogBarber).serviceOfferings ?? []).map((item): BarberOffering => ({
        service: numericId(item.service),
        priceOverride: item.priceOverride,
        durationOverrideMinutes: item.durationOverrideMinutes,
      })),
    },
    location: { id: numericId(location.id), isActive: Boolean(location.isActive) },
    services: services.map(service => ({
      id: numericId(service.id),
      isActive: Boolean(service.isActive),
      price: (service as unknown as CatalogService).price,
      durationMinutes: (service as unknown as CatalogService).durationMinutes,
    })),
  }
}
