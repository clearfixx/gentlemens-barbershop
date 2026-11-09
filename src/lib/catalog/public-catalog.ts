import type { Locale } from '../../i18n/config.ts'
import type { Payload } from 'payload'

export type PublicCatalogFilters = {
  locationId?: number
  barberId?: number
}

export function parseCatalogId(value: string | undefined): number | undefined {
  if (!value) return undefined
  if (!/^[1-9]\d{0,8}$/.test(value)) return undefined
  return Number(value)
}

/** Public catalog queries always include an active predicate, even in Local API. */
export async function loadPublicCatalog(payload: Payload, filters: PublicCatalogFilters = {}, locale: Locale = 'uk') {
  const [locations, services, barbers] = await Promise.all([
    payload.find({
      collection: 'locations', locale, depth: 0, sort: 'name', limit: 100,
      where: { isActive: { equals: true } }, overrideAccess: true,
    }),
    payload.find({
      collection: 'services', locale, depth: 0, sort: 'name', limit: 100,
      where: { isActive: { equals: true } }, overrideAccess: true,
    }),
    payload.find({
      collection: 'barbers', locale, depth: 1, sort: 'name', limit: 100,
      where: {
        and: [
          { isActive: { equals: true } },
          ...(filters.locationId ? [{ location: { equals: filters.locationId } }] : []),
        ],
      },
      overrideAccess: true,
    }),
  ])
  if (locations.hasNextPage || services.hasNextPage || barbers.hasNextPage) {
    throw new Error('Public catalog exceeded its safe page limit')
  }
  const activeLocations = new Set(locations.docs.map(item => item.id))
  const visibleBarbers = barbers.docs.filter(barber => {
    const locationId = typeof barber.location === 'number' ? barber.location : barber.location.id
    return activeLocations.has(locationId)
  })
  const filteredBarbers = filters.barberId
    ? visibleBarbers.filter(barber => barber.id === filters.barberId)
    : visibleBarbers
  const offeredServices = filters.barberId
    ? new Set(filteredBarbers.flatMap(barber =>
        (barber.serviceOfferings ?? []).map((offering: { service: number | { id: number } }) =>
          typeof offering.service === 'number' ? offering.service : offering.service.id),
      ))
    : null
  return {
    locations: locations.docs,
    barbers: filteredBarbers,
    services: services.docs.filter(service => !offeredServices || offeredServices.has(service.id)),
  }
}
