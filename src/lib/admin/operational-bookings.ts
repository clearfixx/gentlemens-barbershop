import type { Payload, Where } from 'payload'
import type { LocationScope } from './location-access.ts'
import { resolveDashboardLocations } from './management-dashboard.ts'

const allowedStatuses = ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'] as const
export type OperationalBookingStatus = typeof allowedStatuses[number]
export type OperationalBookingFilters = {
  location?: string
  status?: string
  date?: string
  page?: string
}
export type OperationalBookingItem = {
  id: number
  locationId: number
  barberId: number
  customerName: string
  startsAt: string
  endsAt: string
  totalPrice: number
  status: OperationalBookingStatus
}
export type OperationalBookingPage = {
  bookings: OperationalBookingItem[]
  page: number
  totalPages: number
  totalDocs: number
  hasNextPage: boolean
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = Date.parse(value + 'T00:00:00Z')
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value
}

export function parseOperationalBookingFilters(
  scope: LocationScope,
  raw: OperationalBookingFilters,
): {
  locationIds: number[] | null
  status?: OperationalBookingStatus
  date?: string
  page: number
} {
  const locationIds = resolveDashboardLocations(scope, raw.location)
  if (locationIds !== null && locationIds.length === 0) {
    throw new Error('No assigned locations')
  }
  if (raw.status !== undefined && !allowedStatuses.includes(raw.status as OperationalBookingStatus)) {
    throw new RangeError('Invalid booking status filter')
  }
  if (raw.date !== undefined && !validDate(raw.date)) {
    throw new RangeError('Invalid booking date filter')
  }
  if (raw.page !== undefined && (!/^[1-9][0-9]{0,2}$/.test(raw.page) ||
      !Number.isSafeInteger(Number(raw.page)))) {
    throw new RangeError('Invalid booking page')
  }
  return {
    locationIds,
    status: raw.status as OperationalBookingStatus | undefined,
    date: raw.date,
    page: raw.page === undefined ? 1 : Number(raw.page),
  }
}

/** Minimal, permission-scoped operational booking inventory.
 * This helper is deliberately separate from the admin-only REST inventory.
 * No phone, email, private notes, customer ID or idempotency fields are returned.
 */
export async function getOperationalBookings(
  payload: Pick<Payload, 'find'>,
  scope: LocationScope,
  filters: OperationalBookingFilters,
): Promise<OperationalBookingPage> {
  const query = parseOperationalBookingFilters(scope, filters)
  const and: Where[] = []
  if (query.locationIds !== null) and.push({ location: { in: query.locationIds } })
  if (query.status !== undefined) and.push({ status: { equals: query.status } })
  if (query.date) {
    const start = query.date + 'T00:00:00.000Z'
    const end = new Date(Date.parse(start) + 86_400_000).toISOString()
    and.push({ startsAt: { less_than: end } })
    and.push({ endsAt: { greater_than: start } })
  }
  const result = await payload.find({
    collection: 'bookings', overrideAccess: true, depth: 0,
    pagination: true, page: query.page, limit: 20,
    sort: ['-startsAt', '-id'],
    ...(and.length ? { where: { and } } : {}),
  })
  if (!Number.isSafeInteger(result.totalDocs) || result.totalDocs < 0 ||
      !Number.isSafeInteger(result.totalPages) || result.totalPages < 0 ||
      !Array.isArray(result.docs) || result.docs.length > 20 ||
      typeof result.hasNextPage !== 'boolean') {
    throw new Error('Invalid operational booking response')
  }
  const bookings = result.docs.map(doc => {
    const locationId = typeof doc.location === 'number' ? doc.location : doc.location.id
    const barberId = typeof doc.barber === 'number' ? doc.barber : doc.barber.id
    if (!Number.isSafeInteger(locationId) || !Number.isSafeInteger(barberId) ||
        !Number.isSafeInteger(Number(doc.id)) ||
        !allowedStatuses.includes(doc.status as OperationalBookingStatus) ||
        typeof doc.customerName !== 'string' ||
        typeof doc.startsAt !== 'string' ||
        typeof doc.endsAt !== 'string' ||
        !Number.isFinite(Date.parse(doc.startsAt)) ||
        !Number.isFinite(Date.parse(doc.endsAt)) ||
        typeof doc.totalPrice !== 'number' || !Number.isFinite(doc.totalPrice)) {
      throw new Error('Invalid operational booking row')
    }
    if (query.locationIds !== null && !query.locationIds.includes(locationId)) {
      throw new Error('Cross-location booking response rejected')
    }
    return {
      id: Number(doc.id), locationId, barberId,
      customerName: doc.customerName,
      startsAt: doc.startsAt, endsAt: doc.endsAt,
      totalPrice: doc.totalPrice,
      status: doc.status as OperationalBookingStatus,
    }
  })
  return {
    bookings,
    page: query.page, totalPages: result.totalPages,
    totalDocs: result.totalDocs, hasNextPage: result.hasNextPage,
  }
}
