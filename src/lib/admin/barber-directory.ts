import type { Payload, Where } from 'payload'
import type { LocationScope } from './location-access.ts'
import { resolveDashboardLocations } from './management-dashboard.ts'

export type BarberAdminFilters = { location?: string; search?: string; page?: string }
export type BarberAdminRow = {
  id: number
  name: string
  slug: string
  locationId: number
  active: boolean
  linkedAccount: boolean
  offeringCount: number
  hasPortrait: boolean
  hasBiography: boolean
}
export type BarberAdminResult = {
  rows: BarberAdminRow[]
  page: number
  totalPages: number
  totalDocs: number
  hasNextPage: boolean
}

export function parseBarberAdminFilters(scope: LocationScope, raw: BarberAdminFilters) {
  const locationIds = resolveDashboardLocations(scope, raw.location)
  if (locationIds !== null && !locationIds.length) throw new Error('No assigned locations')
  if (raw.page !== undefined && (!/^[1-9][0-9]{0,2}$/.test(raw.page) ||
      !Number.isSafeInteger(Number(raw.page)))) {
    throw new RangeError('Invalid barber page')
  }
  const search = raw.search?.trim() ?? ''
  if (search.length > 80 || /[\x00-\x1f\x7f]/.test(search)) {
    throw new RangeError('Invalid barber search')
  }
  return { locationIds, page: raw.page ? Number(raw.page) : 1, search }
}

function relationId(value: number | { id: number } | null | undefined): number | null {
  return typeof value === 'number' ? value : value && typeof value.id === 'number' ? value.id : null
}

/** Read-only staff directory with scope enforced at both query and response.
 * Future professional draft and approval data is deliberately NOT exposed.
 */
export async function loadBarberAdminDirectory(
  payload: Pick<Payload, 'find'>,
  scope: LocationScope,
  filters: BarberAdminFilters,
): Promise<BarberAdminResult> {
  const parsed = parseBarberAdminFilters(scope, filters)
  const and: Where[] = []
  if (parsed.locationIds !== null) and.push({ location: { in: parsed.locationIds } })
  if (parsed.search) and.push({ name: { contains: parsed.search } })
  const result = await payload.find({
    collection: 'barbers', overrideAccess: true, depth: 0,
    limit: 20, page: parsed.page, pagination: true, sort: 'name',
    ...(and.length ? { where: { and } } : {}),
  })
  if (!Number.isSafeInteger(result.totalDocs) || result.totalDocs < 0 ||
      !Number.isSafeInteger(result.totalPages) || result.totalPages < 0 ||
      typeof result.hasNextPage !== 'boolean' || result.docs.length > 20) {
    throw new Error('Invalid barber directory response')
  }
  const rows = result.docs.map(barber => {
    const locationId = relationId(barber.location)
    if (!locationId || (parsed.locationIds !== null && !parsed.locationIds.includes(locationId))) {
      throw new Error('Cross-location barber response rejected')
    }
    if (!Number.isSafeInteger(Number(barber.id)) || typeof barber.name !== 'string' ||
        typeof barber.slug !== 'string') {
      throw new Error('Invalid barber directory row')
    }
    return {
      id: Number(barber.id),
      name: barber.name,
      slug: barber.slug,
      locationId,
      active: barber.isActive === true,
      linkedAccount: relationId(barber.user) !== null,
      offeringCount: barber.serviceOfferings?.length ?? 0,
      hasPortrait: relationId(barber.portrait) !== null,
      hasBiography: Boolean(
        (typeof barber.localizedBio === 'string' && barber.localizedBio.trim()) ||
        (typeof barber.bio === 'string' && barber.bio.trim()),
      ),
    }
  })
  return {
    rows, page: parsed.page, totalPages: result.totalPages,
    totalDocs: result.totalDocs, hasNextPage: result.hasNextPage,
  }
}
