import type { Payload } from 'payload'
import { getBarberAvailability } from '../booking/get-barber-availability.ts'
import { resolvePublicDuration, type AvailabilityInput } from './public-availability.ts'

export async function getPublicAvailability(payload: Payload, input: AvailabilityInput) {
  const [barber, service] = await Promise.all([
    payload.findByID({ collection: 'barbers', id: input.barberId, depth: 0, overrideAccess: true, disableErrors: true }),
    payload.findByID({ collection: 'services', id: input.serviceId, depth: 0, overrideAccess: true, disableErrors: true }),
  ])
  if (!barber || !service || !barber.isActive || !service.isActive) return null
  const locationId = typeof barber.location === 'number' ? barber.location : barber.location.id
  const location = await payload.findByID({
    collection: 'locations', id: locationId, depth: 0, overrideAccess: true, disableErrors: true,
  })
  if (!location?.isActive) return null
  let offering
  try {
    offering = resolvePublicDuration(barber, service)
  } catch (error) {
    if (error instanceof RangeError) return null
    throw error
  }
  const slots = await getBarberAvailability({
    payload, barberId: input.barberId, date: input.date,
    durationMinutes: offering.durationMinutes,
  })
  // Return only public slot data; never serialize booking, customer, or time-off records.
  return {
    barberId: barber.id,
    serviceId: service.id,
    locationId: location.id,
    timeZone: location.timeZone,
    date: input.date,
    durationMinutes: offering.durationMinutes,
    price: offering.price,
    slots: slots.map(slot => ({ startsAt: slot.startsAt, endsAt: slot.endsAt })),
  }
}
