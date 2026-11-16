import type { Payload, Where } from 'payload'
import type { LocationScope } from './location-access.ts'

export type ProfessionalReviewStatus = 'pending' | 'approved' | 'rejected'
export type ProfessionalReviewFilters = { status?: string; page?: string; location?: string }

export function parseProfessionalReviewFilters(scope: LocationScope, filters: ProfessionalReviewFilters) {
  const status = filters.status ?? 'pending'
  if (!['pending', 'approved', 'rejected'].includes(status)) {
    throw new RangeError('Invalid professional review status')
  }
  const page = filters.page ?? '1'
  if (!/^[1-9][0-9]{0,2}$/.test(page)) throw new RangeError('Invalid professional review page')
  let locationIds: number[] | null = scope.role === 'admin' ? null : [...scope.locationIds]
  if (filters.location !== undefined) {
    if (!/^[1-9][0-9]*$/.test(filters.location) ||
        !Number.isSafeInteger(Number(filters.location))) {
      throw new RangeError('Invalid professional review location')
    }
    const id = Number(filters.location)
    if (scope.role !== 'admin' && !scope.locationIds.includes(id)) {
      throw new Error('Professional review location forbidden')
    }
    locationIds = [id]
  }
  if (locationIds !== null && !locationIds.length) {
    throw new Error('Professional review requires assigned location')
  }
  return { status: status as ProfessionalReviewStatus, page: Number(page), locationIds }
}

/** Review inventory only. Snapshots and diffs are PRIVATE and must be served
 * through a separately authorized detail flow, not bulk listing.
 */
export async function loadProfessionalReviewQueue(
  payload: Pick<Payload, 'find'>,
  scope: LocationScope,
  filters: ProfessionalReviewFilters,
) {
  const parsed = parseProfessionalReviewFilters(scope, filters)
  const and: Where[] = [{ status: { equals: parsed.status } }]
  if (parsed.locationIds !== null) and.push({ location: { in: parsed.locationIds } })
  const result = await payload.find({
    collection: 'barber-profile-revisions', overrideAccess: true,
    depth: 0, page: parsed.page, limit: 20, sort: '-createdAt',
    where: { and },
  })
  if (result.docs.length > 20 || !Number.isSafeInteger(result.totalDocs) ||
      !Number.isSafeInteger(result.totalPages)) {
    throw new Error('Invalid professional review queue')
  }
  const relation = (raw: unknown): number => {
    const id = raw && typeof raw === 'object' && 'id' in raw ? raw.id : raw
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) {
      throw new Error('Invalid professional review relationship')
    }
    return id
  }
  return {
    rows: result.docs.map(item => {
      const locationId = relation(item.location)
      if (parsed.locationIds !== null && !parsed.locationIds.includes(locationId)) {
        throw new Error('Cross-location professional review result rejected')
      }
      return {
        id: relation(item.id),
        barberId: relation(item.barber),
        locationId,
        status: item.status,
        createdAt: item.createdAt,
        reviewedAt: item.reviewedAt ?? null,
        hasRejectionReason: Boolean(item.rejectionReason),
      }
    }),
    totalDocs: result.totalDocs,
    totalPages: result.totalPages,
    hasNextPage: result.hasNextPage,
    page: parsed.page,
    status: parsed.status,
  }
}
