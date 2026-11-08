import type { Payload } from 'payload'
import type { BookingCatalog } from './create-booking.ts'
import type { BookingRequest } from './booking-request.ts'

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

  const [barber, location, ...services] = await Promise.all([
    payload.findByID({ collection: 'barbers', id: request.barberId, depth: 0, overrideAccess: true }),
    payload.findByID({ collection: 'locations', id: request.locationId, depth: 0, overrideAccess: true }),
    ...request.serviceIds.map(id =>
      payload.findByID({ collection: 'services', id, depth: 0, overrideAccess: true }),
    ),
  ])
  const barberLocationId = typeof barber.location === 'number'
    ? barber.location : barber.location.id
  return {
    barber: {
      id: barber.id,
      locationId: barberLocationId,
      isActive: Boolean(barber.isActive),
      offerings: (barber.serviceOfferings ?? []).map(item => ({
        service: typeof item.service === 'number' ? item.service : item.service.id,
        priceOverride: item.priceOverride,
        durationOverrideMinutes: item.durationOverrideMinutes,
      })),
    },
    location: { id: location.id, isActive: Boolean(location.isActive) },
    services: services.map(service => ({
      id: service.id,
      isActive: Boolean(service.isActive),
      price: service.price,
      durationMinutes: service.durationMinutes,
    })),
  }
}
