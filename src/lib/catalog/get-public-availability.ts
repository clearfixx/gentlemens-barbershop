import type { Payload } from 'payload'
import { getBarberAvailability } from '../booking/get-barber-availability.ts'
import { resolvePublicDuration, type AvailabilityInput } from './public-availability.ts'

export async function getPublicAvailability(payload: Payload, input: AvailabilityInput) {
  // Every service in a combination must be independently active and offered
  // by the selected barber. Never accept client-provided price or duration.
  const [barber, ...services] = await Promise.all([
    payload.findByID({
      collection: 'barbers', id: input.barberId, depth: 0,
      overrideAccess: true, disableErrors: true,
    }),
    ...input.serviceIds.map(id => payload.findByID({
      collection: 'services', id, depth: 0,
      overrideAccess: true, disableErrors: true,
    })),
  ])
  if (!barber?.isActive || services.some(service => !service?.isActive)) return null

  const locationId = typeof barber.location === 'number' ? barber.location : barber.location.id
  const location = await payload.findByID({
    collection: 'locations', id: locationId, depth: 0, overrideAccess: true, disableErrors: true,
  })
  if (!location?.isActive) return null

  let durationMinutes = 0
  let price = 0
  try {
    for (const service of services) {
      // The previous guard ensures no service is missing or inactive.
      if (!service) return null
      const offering = resolvePublicDuration(
        barber as unknown as Parameters<typeof resolvePublicDuration>[0],
        service as unknown as Parameters<typeof resolvePublicDuration>[1],
      )
      durationMinutes += offering.durationMinutes
      price += offering.price
    }
    // Match the trusted booking persistence quote constraints.
    if (!Number.isSafeInteger(durationMinutes) || durationMinutes > 480 ||
        !Number.isSafeInteger(price) || price < 0) return null
  } catch (error) {
    if (error instanceof RangeError) return null
    throw error
  }

  const slots = await getBarberAvailability({
    payload, barberId: input.barberId, date: input.date,
    durationMinutes,
  })
  // Public API must never advertise slots that have already begun.
  const now = Date.now()
  // Preserve serviceId for the original single-service clients.
  // serviceIds is the canonical combination returned for all requests.
  return {
    barberId: barber.id,
    serviceIds: [...input.serviceIds],
    ...(input.serviceIds.length === 1 ? { serviceId: input.serviceIds[0] } : {}),
    locationId: location.id,
    timeZone: location.timeZone,
    date: input.date,
    durationMinutes,
    price,
    slots: slots.filter(slot => Date.parse(slot.startsAt) > now).map(slot => ({
      startsAt: slot.startsAt, endsAt: slot.endsAt,
    })),
  }
}
